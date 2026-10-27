"""Roda um cenário no terminal: cancelamento, decisão do agente, resposta da cliente e aprovação.

Uso:
    python terminal.py S1          você responde como a cliente e aprova
    python terminal.py S1 --auto   usa as respostas prontas do cenário e aprova sozinho
"""
import argparse
import copy
import json
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.table import Table

from src.agente import decidir
from src.canal import CanalSimulado
from src.dados import carregar_cenario
from src.ferramentas import buscar_candidatos, confirmar_movimento, liberar_horario
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
        console.print(f"[red]Parou: {e}[/red] A agenda não foi alterada.")
        raise SystemExit(1)


def rodar(cenario_id: str, automatico: bool) -> None:
    """Um nível do fluxo (sem cascata): do cancelamento até a aprovação."""
    cenario = copy.deepcopy(carregar_cenario(cenario_id))
    canal = CanalSimulado(cenario.respostas if automatico else None)
    log: list[dict] = []
    console.rule(f"Cenário {cenario.id}: {cenario.nome}")

    vago = cenario.slot(cenario.slot_cancelado_id)
    quem_cancelou = cenario.clientes[vago.cliente_id].nome
    liberar_horario(cenario, vago.id)
    console.print(
        f"[bold]Cancelamento:[/bold] {quem_cancelou} liberou {vago.data} {vago.hora} "
        f"({vago.duracao_min} min) com {cenario.antecedencia_h(vago):.0f}h de aviso."
    )

    candidatos = buscar_candidatos(cenario, vago.id)
    mostrar_candidatos(cenario, candidatos)
    if not any(c.elegivel for c in candidatos):
        console.print("[yellow]Ninguém passou nos filtros com valor esperado positivo. O agente não mexe.[/yellow]")
        return salvar_log(cenario, log)

    decisao = decidir(cenario, vago.id)
    log.append({"etapa": "decisao", "cliente_id": decisao.cliente_id, "justificativa": decisao.justificativa, "passos": decisao.log})
    console.print(Panel(decisao.justificativa, title="Decisão do agente (gerada pelo modelo)"))
    if decisao.cliente_id is None:
        console.print("[yellow]O agente decidiu não mexer.[/yellow]")
        return salvar_log(cenario, log)

    nome = cenario.clientes[decisao.cliente_id].nome
    canal.enviar(decisao.cliente_id, decisao.mensagem)
    console.print(f"[cyan]Agente → {nome}:[/cyan] {decisao.mensagem}")

    resposta = obter_resposta(canal, decisao.cliente_id, nome, automatico)
    interp = interpretar(decisao.mensagem, resposta)
    if interp.resultado == "ambiguo":
        # pergunta uma vez só; se continuar sem dar para entender, conta como recusa
        pergunta = f"Desculpa, não entendi direito. Você consegue vir {vago.data[8:]}/{vago.data[5:7]} às {vago.hora}? Pode responder sim ou não."
        canal.enviar(decisao.cliente_id, pergunta)
        console.print(f"[cyan]Agente → {nome}:[/cyan] {pergunta}")
        resposta = obter_resposta(canal, decisao.cliente_id, nome, automatico)
        interp = interpretar(pergunta, resposta)
        if interp.resultado == "ambiguo":
            interp.resultado = "recusou"
    log.append({"etapa": "interpretacao", "resposta": resposta, "resultado": interp.resultado, "observacao": interp.observacao})
    console.print(f"[magenta]Interpretação do agente:[/magenta] {interp.resultado} ({interp.observacao})")

    if interp.resultado != "aceitou":
        console.print(f"{nome} não aceitou. A agenda continua como estava.")
        return salvar_log(cenario, log)

    if automatico:
        console.print("[dim]Aprovação automática (modo --auto).[/dim]")
        aprovado = True
    else:
        aprovado = Confirm.ask(f"Aprovar e mover {nome} para {vago.data} {vago.hora}?")
    log.append({"etapa": "aprovacao", "aprovado": aprovado, "automatica": automatico})
    if not aprovado:
        console.print("Rejeitado. A agenda não mudou.")
        return salvar_log(cenario, log)

    novo_buraco = confirmar_movimento(cenario, decisao.cliente_id, vago.id)
    dia = cenario.dias[novo_buraco.data]
    console.print(
        f"[green]Agenda atualizada.[/green] Novo horário livre: {novo_buraco.data} {novo_buraco.hora}, "
        f"com {cenario.antecedencia_h(novo_buraco):.0f}h de aviso e {dia.fila_espera} na fila."
    )
    salvar_log(cenario, log)


def obter_resposta(canal: CanalSimulado, cliente_id: str, nome: str, automatico: bool) -> str:
    """Resposta pronta do cenário ou digitada por quem está testando."""
    resposta = canal.receber(cliente_id)
    if resposta is None:
        if automatico:
            resposta = "..."  # sem resposta pronta: cai em ambíguo
        else:
            resposta = Prompt.ask(f"Responda como {nome}")
        canal.responder(cliente_id, resposta)
    console.print(f"[green]{nome}:[/green] {resposta}")
    return resposta


def mostrar_candidatos(cenario: Cenario, candidatos: list[Candidato]) -> None:
    """Tabela com os números calculados pelo código."""
    tabela = Table(title="Candidatas (números calculados pelo código)")
    for coluna in ("Cliente", "Horário dela", "Falta", "Aceita", "Aviso que sobra", "Fila", "Valor esperado", "Situação"):
        tabela.add_column(coluna)
    for c in candidatos:
        if c.motivo == "nao_posterior":
            continue  # quem já está antes do horário livre só polui a tabela
        slot = cenario.slot(c.slot_atual_id)
        numeros = (
            [f"{c.taxa_falta:.0%}", f"{c.prob_aceitar:.0%}", f"{c.antecedencia_novo_h:.0f}h", str(c.fila_novo), f"R$ {c.valor_esperado:.2f}"]
            if c.valor_esperado is not None
            else ["-"] * 5
        )
        situacao = "Elegível" if c.elegivel else MOTIVOS[c.motivo]
        tabela.add_row(c.nome, f"{slot.data[8:]}/{slot.data[5:7]} {slot.hora}", *numeros, situacao)
    console.print(tabela)


def salvar_log(cenario: Cenario, log: list[dict]) -> None:
    """Guarda cada passo em logs/ para depurar e para o README."""
    PASTA_LOGS.mkdir(exist_ok=True)
    caminho = PASTA_LOGS / f"{cenario.id}-{datetime.now():%Y%m%d-%H%M%S}.json"
    caminho.write_text(json.dumps(log, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    console.print(f"[dim]Log salvo em {caminho.relative_to(PASTA_LOGS.parent)}[/dim]")


if __name__ == "__main__":
    main()
