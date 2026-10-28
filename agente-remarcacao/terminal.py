"""Roda um cenário no terminal, com cascata: cancelamento, decisão, resposta, aprovação e o buraco seguinte.

Uso:
    python terminal.py S1          você responde como a cliente e aprova
    python terminal.py S1 --auto   usa as respostas prontas do cenário e aprova sozinho
"""
import argparse
import copy
import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.table import Table

from src.canal import CanalSimulado
from src.cascata import MAX_PROF, Atores, tratar_cancelamento
from src.dados import carregar_cenario
from src.escolha import decidir_pelo_codigo
from src.ferramentas import liberar_horario
from src.filtros import MOTIVOS
from src.interpretacao import interpretar
from src.llm import ErroLLM
from src.modelos import Candidato, Cenario

console = Console()
PASTA_LOGS = Path(__file__).resolve().parent / "logs"


def main() -> None:
    """Lê os argumentos e roda."""
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("cenario", help="S1 a S6")
    args.add_argument("--auto", action="store_true", help="respostas prontas e aprovação automática")
    opcoes = args.parse_args()
    try:
        rodar(opcoes.cenario.upper(), opcoes.auto)
    except ErroLLM as e:
        console.print(f"[red]Parou: {e}[/red] O que já tinha sido aprovado continua; o resto da agenda não mudou.")
        raise SystemExit(1)


def rodar(cenario_id: str, automatico: bool) -> list:
    """Roda a cascata inteira de um cenário e devolve os passos."""
    cenario = copy.deepcopy(carregar_cenario(cenario_id))
    console.rule(f"Cenário {cenario.id}: {cenario.nome} ({cenario.o_que_prova})")

    vago = cenario.slot(cenario.slot_cancelado_id)
    quem_cancelou = cenario.clientes[vago.cliente_id].nome
    liberar_horario(cenario, vago.id)
    console.print(
        f"[bold]Cancelamento:[/bold] {quem_cancelou} liberou {_quando(vago)} com {cenario.nome_profissional(vago.profissional_id)} "
        f"({vago.duracao_min} min), {cenario.antecedencia_h(vago):.0f}h de aviso."
    )

    def perguntar(cliente_id: str) -> str:
        return Prompt.ask(f"Responda como {cenario.clientes[cliente_id].nome}")

    def aprovar(cenario: Cenario, decisao, slot_id: str) -> bool:
        nome, slot = cenario.clientes[decisao.cliente_id].nome, cenario.slot(slot_id)
        if automatico:
            console.print("[dim]Aprovação automática (modo --auto).[/dim]")
            return True
        return Confirm.ask(f"Aprovar e mover {nome} para {_quando(slot)}?")

    canal = CanalSimulado(cenario.respostas if automatico else None, perguntar=None if automatico else perguntar)
    atores = Atores(decidir_pelo_codigo, interpretar, canal, aprovar, avisar=lambda e, d: mostrar(cenario, canal, e, d))
    passos = tratar_cancelamento(cenario, vago.id, atores)
    salvar_log(cenario, passos)
    return passos


def mostrar(cenario: Cenario, canal: CanalSimulado, evento: str, dados: dict) -> None:
    """Imprime cada evento da cascata."""
    if evento == "candidatos":
        slot = cenario.slot(dados["slot_id"])
        console.print(f"\n[bold]Nível {dados['profundidade']} de {MAX_PROF}[/bold]: horário livre {_quando(slot)} com {cenario.nome_profissional(slot.profissional_id)}")
        mostrar_candidatos(cenario, dados["candidatos"])
    elif evento == "decisao":
        console.print(Panel(dados["decisao"].justificativa, title="Por que ela (calculado pelo código)"))
    elif evento == "interpretacao":
        cliente_id = dados["cliente_id"]
        nome = cenario.clientes[cliente_id].nome
        conversa = canal.conversa(cliente_id)
        for m in conversa[-2:]:  # a última pergunta do agente e a resposta
            quem = f"[cyan]Agente → {nome}[/cyan]" if m.de == "agente" else f"[green]{nome}[/green]"
            console.print(f"{quem}: {m.texto}")
        interp = dados["interpretacao"]
        console.print(f"[magenta]Interpretação do agente:[/magenta] {interp.resultado} ({interp.observacao})")
    elif evento == "movimento":
        novo = dados["novo_buraco"]
        console.print(
            f"[green]Agenda atualizada.[/green] Novo horário livre: {_quando(novo)}, "
            f"com {cenario.antecedencia_h(novo):.0f}h de aviso e {cenario.dias[novo.data].fila_espera} na fila."
        )
    elif evento == "fim":
        passo = dados["passo"]
        cor = {"nao_agir": "yellow", "limite": "yellow", "rejeitado": "red"}.get(passo.resultado, "white")
        console.print(f"[{cor}]Fim: {passo.justificativa if passo.resultado != 'rejeitado' else 'rejeitado na aprovação; a agenda não mudou.'}[/{cor}]")


def mostrar_candidatos(cenario: Cenario, candidatos: list[Candidato]) -> None:
    """Tabela com os números calculados pelo código."""
    tabela = Table(title="Candidatas (números calculados pelo código)")
    for coluna in ("Cliente", "Horário dela", "Prefere", "Falta", "Aceita", "Aviso que sobra", "Fila", "Valor esperado", "Situação"):
        tabela.add_column(coluna)
    for c in candidatos:
        if c.motivo == "nao_posterior":
            continue  # quem já está antes do horário livre só polui a tabela
        numeros = (
            [f"{c.taxa_falta:.0%}", f"{c.prob_aceitar:.0%}", f"{c.antecedencia_novo_h:.0f}h", str(c.fila_novo), f"R$ {c.valor_esperado:.2f}"]
            if c.valor_esperado is not None
            else ["-"] * 5
        )
        situacao = "Elegível" if c.elegivel else MOTIVOS[c.motivo]
        prefere = cenario.nome_profissional(cenario.clientes[c.cliente_id].profissional_preferida)
        tabela.add_row(c.nome, _quando(cenario.slot(c.slot_atual_id)), prefere, *numeros, situacao)
    console.print(tabela)


def _quando(slot) -> str:
    """Ex.: 28/10 13:00."""
    return f"{slot.inicio:%d/%m %H:%M}"


def salvar_log(cenario: Cenario, passos: list) -> None:
    """Guarda cada passo em logs/ para depurar e para o README."""
    PASTA_LOGS.mkdir(exist_ok=True)
    caminho = PASTA_LOGS / f"{cenario.id}-{datetime.now():%Y%m%d-%H%M%S}.json"
    caminho.write_text(json.dumps([asdict(p) for p in passos], ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    console.print(f"[dim]Log salvo em {caminho.relative_to(PASTA_LOGS.parent)}[/dim]")


if __name__ == "__main__":
    main()
