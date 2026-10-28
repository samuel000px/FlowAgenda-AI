"""Roda os cenários com as três estratégias e escreve resultados.md.

Uso:  python avaliar.py

Chama o Gemini de verdade (agente e interpretação das respostas). Ver docs/metrica.md.
"""
import copy
import os
from datetime import datetime
from pathlib import Path

from rich.console import Console

from src.agente import decidir
from src.canal import CanalSimulado
from src.cascata import Atores, Passo, tratar_cancelamento
from src.dados import carregar_cenarios
from src.ferramentas import buscar_candidatos, confirmar_movimento, liberar_horario
from src.interpretacao import interpretar
from src.llm import ErroLLM
from src.metrica import horas_vagas_esperadas
from src.modelos import Cenario

console = Console()
SAIDA = Path(__file__).resolve().parent / "resultados.md"


def cancelado(cenario: Cenario) -> Cenario:
    """Cópia do cenário logo depois do cancelamento."""
    c = copy.deepcopy(cenario)
    liberar_horario(c, c.slot_cancelado_id)
    return c


def ninguem_faz_nada(cenario: Cenario) -> tuple[Cenario, list[Passo]]:
    """Estratégia 1: o horário fica vago."""
    return cancelado(cenario), []


def fila_ingenua(cenario: Cenario, slot_id: str, recusados) -> list[str]:
    """Quem passa nos filtros duros, em ordem cronológica do agendamento. Sem score e sem poda."""
    candidatos = buscar_candidatos(cenario, slot_id, recusados)
    # "valor_negativo" é a poda do agente; a regra ingênua não poda
    validos = [c for c in candidatos if c.motivo in (None, "valor_negativo")]
    validos.sort(key=lambda c: cenario.slot(c.slot_atual_id).inicio)
    return [c.cliente_id for c in validos]


def regra_ingenua(cenario: Cenario) -> tuple[Cenario, list[Passo]]:
    """Estratégia 2: oferece em ordem cronológica; se recusar, tenta a próxima. Um nível só."""
    c = cancelado(cenario)
    canal = CanalSimulado(c.respostas)
    slot = c.slot(c.slot_cancelado_id)
    recusados, passos = set(), []
    while fila := fila_ingenua(c, slot.id, recusados):
        cliente_id = fila[0]
        mensagem = f"Oi, {c.clientes[cliente_id].nome}! Abriu um horário dia {slot.inicio:%d/%m} às {slot.hora}. Quer antecipar? Se preferir, mantém o seu."
        canal.enviar(cliente_id, mensagem)
        resposta = canal.receber(cliente_id) or ""
        interp = interpretar(mensagem, resposta)
        if interp.resultado == "aceitou":
            confirmar_movimento(c, cliente_id, slot.id)
            passos.append(Passo(0, slot.id, "aceitou", cliente_id, resposta=resposta, interpretacao=interp.resultado))
            break
        passos.append(Passo(0, slot.id, "recusou", cliente_id, resposta=resposta, interpretacao=interp.resultado))
        recusados.add(cliente_id)
    return c, passos


def agente(cenario: Cenario) -> tuple[Cenario, list[Passo]]:
    """Estratégia 3: o fluxo completo com o Gemini. Aprovação automática (modo de avaliação)."""
    c = cancelado(cenario)
    atores = Atores(decidir, interpretar, CanalSimulado(c.respostas), aprovar=lambda *_: True)
    return c, tratar_cancelamento(c, c.slot_cancelado_id, atores)


def descrever(cenario: Cenario, passos: list[Passo]) -> str:
    """Resumo curto dos passos, para a tabela de detalhes."""
    if not passos:
        return "nada"
    partes = []
    for p in passos:
        nome = cenario.clientes[p.cliente_id].nome.split()[0] if p.cliente_id else ""
        partes.append({"aceitou": f"{nome} aceitou", "recusou": f"{nome} recusou", "nao_agir": "não mexe",
                       "limite": "limite", "rejeitado": f"{nome} rejeitada",
                       "sem_resposta": f"{nome} não respondeu"}[p.resultado])
    return " → ".join(partes)


def bate_com_esperado(passos: list[Passo], esperado: list[dict]) -> bool:
    """Confere a sequência do agente com a anotada no cenarios.json."""
    feitos = []
    for p in passos:
        if p.cliente_id and p.resultado in ("aceitou", "recusou"):
            feitos.append((p.profundidade, p.slot_id, p.cliente_id, p.resultado))
        else:
            feitos.append((p.profundidade, p.slot_id, None, p.resultado))
    anotados = [(e["profundidade"], e["slot_id"], e.get("escolha"), e.get("resposta", e.get("resultado"))) for e in esperado]
    return feitos == anotados


def main() -> None:
    """Roda tudo e escreve o relatório."""
    linhas, detalhes = [], []
    totais = {"nada": 0.0, "ingenua": 0.0, "agente": 0.0}
    for cenario in carregar_cenarios():
        console.print(f"[bold]{cenario.id} {cenario.nome}[/bold]")
        resultados = {}
        for nome, estrategia in (("nada", ninguem_faz_nada), ("ingenua", regra_ingenua), ("agente", agente)):
            final, passos = estrategia(cenario)
            resultados[nome] = (horas_vagas_esperadas(cenario, final), passos)
            console.print(f"  {nome:8} {resultados[nome][0]:.3f} h  {descrever(cenario, passos)}")
        base = resultados["nada"][0]
        for nome in totais:
            totais[nome] += resultados[nome][0]
        reducao = lambda h: f"{(base - h) / base:.0%}" if base else "-"
        ok = bate_com_esperado(resultados["agente"][1], cenario.esperado["passos"])
        linhas.append(
            f"| {cenario.id} {cenario.nome} | {base:.2f} | {resultados['ingenua'][0]:.2f} ({reducao(resultados['ingenua'][0])}) "
            f"| {resultados['agente'][0]:.2f} ({reducao(resultados['agente'][0])}) | {comparar(resultados)} |"
        )
        detalhes.append(
            f"| {cenario.id} | {descrever(cenario, resultados['ingenua'][1])} | {descrever(cenario, resultados['agente'][1])} "
            f"| {'sim' if ok else 'não'} |"
        )

    base = totais["nada"]
    linhas.append(
        f"| **Total** | **{base:.2f}** | **{totais['ingenua']:.2f} ({(base - totais['ingenua']) / base:.0%})** "
        f"| **{totais['agente']:.2f} ({(base - totais['agente']) / base:.0%})** | |"
    )
    escrever(linhas, detalhes)
    console.print(f"\n[green]Relatório salvo em {SAIDA.name}[/green]")


def comparar(resultados: dict) -> str:
    """Quem ficou com menos horas vagas: agente ou regra ingênua."""
    ingenua, agente_h = resultados["ingenua"][0], resultados["agente"][0]
    if abs(ingenua - agente_h) < 0.005:
        return "empate"
    return "agente" if agente_h < ingenua else "**regra ingênua**"


def escrever(linhas: list[str], detalhes: list[str]) -> None:
    """Monta o resultados.md."""
    modelo = os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite"
    texto = f"""# Resultados

Gerado por `python avaliar.py` em {datetime.now():%d/%m/%Y %H:%M}, com o modelo `{modelo}`.

> **Atenção:** são estimativas baseadas no próprio modelo de score, sobre **dados fictícios**, com
> respostas das clientes roteirizadas. Não é uma medição no mundo real. A métrica está em
> [docs/metrica.md](docs/metrica.md).

## Horas vagas esperadas no fim (menor é melhor)

Entre parênteses, a redução em relação a "ninguém faz nada".

| Cenário | Ninguém faz nada | Regra ingênua | Agente | Melhor |
|---|---|---|---|---|
{chr(10).join(linhas)}

## O que cada estratégia fez

| Cenário | Regra ingênua | Agente | Agente bateu com o esperado? |
|---|---|---|---|
{chr(10).join(detalhes)}

## Leitura

- **Empates.** No cenário 1, a primeira da ordem cronológica (Elisa) recusou, e a regra ingênua chegou
  na Beatriz do mesmo jeito. Se a Elisa tivesse aceitado, ficaria um buraco no fim do dia sem fila; o
  agente nem chega a perguntar para ela (poda). No cenário 4, a preferida do agente (Larissa) recusou e
  as duas estratégias terminaram com a Marina.
- **Cenário 7.** O agente chama primeiro quem prefere a profissional do horário, mesmo com valor
  esperado menor. Isso é uma regra do salão, não uma conta: a métrica não mede preferência, então ali
  o agente pode empatar ou até perder um pouco para a regra ingênua.
- **Onde o agente ganha.** Quando a ordem cronológica escolhe alguém cujo horário seria difícil de
  preencher (cenários 3 e 6), quando outra cliente tem menos risco de falta (cenário 5) e quando a cascata
  troca mais um buraco difícil por um fácil (cenário 2). No cenário 3 a regra ingênua deixa a agenda
  **pior** do que não fazer nada.
- Cada rodada usa o Gemini de verdade, então o modelo pode escolher diferente numa próxima execução. Se
  isso acontecer, a coluna "bateu com o esperado" mostra "não" e os números refletem o que de fato aconteceu.
"""
    SAIDA.write_text(texto, encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except ErroLLM as e:
        console.print(f"[red]Parou: {e}[/red] O resultados.md anterior foi mantido.")
        raise SystemExit(1)
