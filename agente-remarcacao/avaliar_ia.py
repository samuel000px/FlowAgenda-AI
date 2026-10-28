"""Mede a parte de IA com casos difíceis e escreve docs/avaliacao-ia.md. Não muda nada no agente.

Uso:  python avaliar_ia.py            (cada caso roda 2 vezes, para medir consistência)
      python avaliar_ia.py --rodadas 3
      python avaliar_ia.py --recalcular logs/avaliacao-ia-....json   (refaz as notas sem chamar o Gemini)

Chama o Gemini de verdade. Os casos estão em avaliacao_ia/.
"""
import argparse
import copy
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

from rich.console import Console

from avaliacao_ia.casos_decisao import casos
from src.agente import decidir
from src.ferramentas import buscar_candidatos
from src.interpretacao import interpretar
from src.llm import ErroLLM, _modelo

console = Console()
PASTA = Path(__file__).resolve().parent
SAIDA = PASTA / "docs" / "avaliacao-ia.md"


def problemas_da_mensagem(mensagem: str, nome_completo: str, hora: str, profissional: str) -> list[str]:
    """Regras que toda mensagem precisa cumprir. Devolve o que falhou (lista vazia = tudo certo)."""
    texto = mensagem.lower()
    falhas = []
    if hora.split(":")[0] not in mensagem:
        falhas.append("não diz a hora")
    if profissional.lower() not in texto:
        falhas.append("não diz a profissional")
    if not re.search(r"\bmant(er|enha|ém|em)\b|continuar (com|no|na)|ficar (com|no|na)|seu horário (de|da|do)", texto):
        falhas.append("não oferece manter o horário")
    sobrenome = nome_completo.split()[-1].lower()
    if len(nome_completo.split()) > 1 and sobrenome in texto:
        falhas.append("usa o sobrenome")
    if re.search(r"quem responder primeiro|primeira a responder|primeiro a responder", texto):
        falhas.append("fala em quem responder primeiro")
    if len(mensagem) > 500:
        falhas.append("mensagem longa demais")
    return falhas


def avaliar_interpretacao(rodadas: int) -> list[dict]:
    """Uma chamada por caso em cada rodada."""
    dados = json.loads((PASTA / "avaliacao_ia" / "casos_interpretacao.json").read_text(encoding="utf-8"))
    resultados = []
    for rodada in range(1, rodadas + 1):
        for caso in dados["casos"]:
            try:
                veio = interpretar(dados["proposta"], caso["resposta"]).resultado
            except ErroLLM as e:
                veio = f"erro: {e}"
            resultados.append({**caso, "rodada": rodada, "veio": veio, "certo": veio in caso["aceitas"]})
            console.print(f"  {'OK ' if resultados[-1]['certo'] else 'ERRO'} r{rodada} {veio:14} {caso['resposta'][:70]}")
    return resultados


def avaliar_decisoes(rodadas: int) -> list[dict]:
    """Cada situação roda algumas vezes; guarda escolha, se é aceitável, se é a do topo e a mensagem."""
    resultados = []
    for caso in casos():
        elegiveis = [c for c in buscar_candidatos(caso.cenario, "V") if c.elegivel]
        topo = elegiveis[0].cliente_id
        vago = caso.cenario.slot("V")
        profissional = caso.cenario.nome_profissional(vago.profissional_id)
        for rodada in range(1, rodadas + 1):
            cenario = copy.deepcopy(caso.cenario)
            try:
                d = decidir(cenario, "V")
                escolha, mensagem, justificativa = d.cliente_id, d.mensagem or "", d.justificativa
                erro = None
            except ErroLLM as e:
                escolha, mensagem, justificativa, erro = "erro", "", "", str(e)
            falhas = []
            if escolha not in (None, "erro"):
                falhas = problemas_da_mensagem(mensagem, cenario.clientes[escolha].nome, vago.hora, profissional)
            resultados.append({
                "caso": caso.id, "titulo": caso.titulo, "o_que_mede": caso.o_que_mede, "rodada": rodada,
                "escolha": escolha, "topo": topo, "aceitavel": escolha in caso.aceitas, "igual_ao_topo": escolha == topo,
                "falhas_mensagem": falhas, "mensagem": mensagem, "justificativa": justificativa, "erro": erro,
            })
            marca = "OK " if escolha in caso.aceitas and not falhas else "ERRO"
            console.print(f"  {marca} {caso.id} rodada {rodada}: escolheu {escolha} (topo {topo}) {falhas or ''}")
    return resultados


def recalcular_mensagens(decisoes: list[dict]) -> list[dict]:
    """Aplica as regras atuais de mensagem a decisões já salvas (útil quando uma regra é corrigida)."""
    por_id = {c.id: c for c in casos()}
    for r in decisoes:
        cenario = por_id[r["caso"]].cenario
        if r["escolha"] not in (None, "erro"):
            vago = cenario.slot("V")
            r["falhas_mensagem"] = problemas_da_mensagem(
                r["mensagem"], cenario.clientes[r["escolha"]].nome, vago.hora, cenario.nome_profissional(vago.profissional_id)
            )
    return decisoes


def escrever(interp: list[dict], decisoes: list[dict], rodadas: int) -> None:
    """Monta o relatório."""
    certos = sum(r["certo"] for r in interp)
    por_grupo = Counter(r["grupo"] for r in interp)
    certos_grupo = Counter(r["grupo"] for r in interp if r["certo"])
    linhas_grupo = "\n".join(f"| {g} | {certos_grupo[g]} de {n} |" for g, n in por_grupo.items())
    erros_interp = "\n".join(
        f"| {r['resposta']} | {', '.join(r['aceitas'])} | {r['veio']} (rodada {r.get('rodada', 1)}) |"
        for r in interp if not r["certo"]
    ) or "| (nenhum) | | |"
    # consistência: a mesma resposta recebeu sempre a mesma classificação?
    vistas: dict[str, set] = {}
    for r in interp:
        vistas.setdefault(r["resposta"], set()).add(r["veio"])
    instaveis = {resp: v for resp, v in vistas.items() if len(v) > 1}
    linhas_instaveis = "\n".join(f"| {resp} | {', '.join(sorted(v))} |" for resp, v in instaveis.items()) or "| (nenhuma) | |"
    rodadas_interp = max(r.get("rodada", 1) for r in interp)

    # rodada que falhou por limite ou erro da API não diz nada sobre a IA: fica fora das contas
    validas = [r for r in decisoes if r["escolha"] != "erro"]
    erros_api = len(decisoes) - len(validas)
    linhas_decisao, consistencia = [], []
    for caso_id in dict.fromkeys(r["caso"] for r in decisoes):
        rs = [r for r in decisoes if r["caso"] == caso_id]
        ok = [r for r in rs if r["escolha"] != "erro"]
        escolhas = ["erro da API" if r["escolha"] == "erro" else r["escolha"] or "não mexe" for r in rs]
        linhas_decisao.append(
            f"| {caso_id} {rs[0]['titulo']} | {rs[0]['o_que_mede']} | {rs[0]['topo']} | {', '.join(escolhas)} | "
            f"{sum(r['aceitavel'] for r in ok)} de {len(ok)} | {sum(not r['falhas_mensagem'] for r in ok)} de {len(ok)} |"
        )
        consistencia.append(len({r["escolha"] for r in ok}) <= 1)
    aceitaveis = sum(r["aceitavel"] for r in validas)
    no_topo = sum(r["igual_ao_topo"] for r in validas)
    msgs_ok = sum(not r["falhas_mensagem"] for r in decisoes if r["escolha"] not in (None, "erro"))
    com_msg = sum(r["escolha"] not in (None, "erro") for r in decisoes)
    falhas_msg = "\n".join(
        f"| {r['caso']} rodada {r['rodada']} | {', '.join(r['falhas_mensagem'])} | {r['mensagem']} |"
        for r in decisoes if r["falhas_mensagem"]
    ) or "| (nenhuma) | | |"
    exemplos = "\n\n".join(
        f"**{r['caso']} {r['titulo']}**, escolheu {r['escolha'] or 'não mexer'}:\n> {r['justificativa']}"
        for r in decisoes if r["rodada"] == 1
    )

    texto = f"""# Avaliação da parte de IA

Gerado por `python avaliar_ia.py` em {datetime.now():%d/%m/%Y %H:%M}, com o modelo `{_modelo()}`.
Os casos estão em `avaliacao_ia/`. Nada aqui muda o agente: é uma medição.

## 1. Interpretação das respostas: {certos} de {len(interp)} certas

{len(vistas)} respostas diferentes, cada uma classificada {rodadas_interp} vez(es). Uma classificação conta como
certa se está entre as aceitas para aquele caso.

| Tipo de resposta | Certas |
|---|---|
{linhas_grupo}

Erros:

| Resposta da cliente | Aceitas | O modelo disse |
|---|---|---|
{erros_interp}

Mesma resposta, classificações diferentes entre rodadas ({len(instaveis)} de {len(vistas)}):

| Resposta da cliente | Classificações que apareceram |
|---|---|
{linhas_instaveis}

## 2. Escolha da cliente: {aceitaveis} de {len(validas)} aceitáveis

Cada situação rodou {rodadas} vez(es). "Topo" é a primeira da lista que o código ordenou.
{f"{erros_api} rodada(s) falharam por limite ou erro da API e não entram nas contas." if erros_api else ""}

| Situação | O que mede | Topo | Escolhas | Aceitáveis | Mensagem ok |
|---|---|---|---|---|---|
{chr(10).join(linhas_decisao)}

- Igual ao topo do código: {no_topo} de {len(validas)}.
- Mesma escolha em todas as rodadas: {sum(consistencia)} de {len(consistencia)} situações.
- Mensagens que cumprem todas as regras: {msgs_ok} de {com_msg}. As regras são: dizer a hora e a
  profissional, oferecer manter o horário, não usar sobrenome, não falar em "quem responder
  primeiro" e ter até 500 caracteres.

Mensagens com problema:

| Onde | O que faltou | Mensagem |
|---|---|---|
{falhas_msg}

## 3. Justificativas da primeira rodada

{exemplos}
"""
    SAIDA.write_text(texto, encoding="utf-8")
    (PASTA / "logs").mkdir(exist_ok=True)
    bruto = PASTA / "logs" / f"avaliacao-ia-{datetime.now():%Y%m%d-%H%M%S}.json"
    bruto.write_text(json.dumps({"interpretacao": interp, "decisoes": decisoes}, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    """Roda as duas partes e escreve o relatório."""
    opcoes = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    opcoes.add_argument("--rodadas", type=int, default=2, help="quantas vezes cada decisão roda")
    opcoes.add_argument("--recalcular", type=Path, help="refaz as notas a partir de um resultado salvo em logs/")
    args = opcoes.parse_args()
    if args.recalcular:
        salvo = json.loads(args.recalcular.read_text(encoding="utf-8"))
        decisoes = recalcular_mensagens(salvo["decisoes"])
        escrever(salvo["interpretacao"], decisoes, max(r["rodada"] for r in decisoes))
        console.print(f"[green]Relatório refeito em {SAIDA.relative_to(PASTA)}, sem chamar o modelo.[/green]")
        return
    console.print("[bold]Interpretação[/bold]")
    interp = avaliar_interpretacao(args.rodadas)
    console.print("[bold]Decisões[/bold]")
    decisoes = avaliar_decisoes(args.rodadas)
    escrever(interp, decisoes, args.rodadas)
    console.print(f"\n[green]Relatório em {SAIDA.relative_to(PASTA)}[/green]")


if __name__ == "__main__":
    main()
