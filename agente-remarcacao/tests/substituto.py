"""Substituto determinístico do modelo. SÓ PARA TESTES.

Serve para testar a cascata sem gastar cota. Nunca usar o resultado disto como resultado do agente.
"""
from src.canal import CanalSimulado
from src.cascata import Atores
from src.ferramentas import buscar_candidatos
from src.interpretacao import Interpretacao
from src.modelos import Cenario, Decisao


def decidir_pelo_maior_valor(cenario: Cenario, slot_id: str, recusados, profundidade: int) -> Decisao:
    """Escolhe a elegível com maior valor esperado (a primeira da lista)."""
    elegiveis = [c for c in buscar_candidatos(cenario, slot_id, recusados) if c.elegivel]
    if not elegiveis:
        return Decisao(None, "substituto: ninguém elegível", None, [])
    c = elegiveis[0]
    return Decisao(c.cliente_id, f"substituto: maior valor esperado ({c.valor_esperado:.2f})", f"Oi {c.nome}, abriu um horário. Quer vir?", [])


def interpretar_por_palavras(proposta: str, resposta: str) -> Interpretacao:
    """Regra boba de palavras: "não" recusa; "sim", "pode", "consigo" aceitam."""
    texto = resposta.lower()
    if "não" in texto or "nao" in texto:
        return Interpretacao("recusou", None, "palavra 'não'", [])
    if any(p in texto for p in ("sim", "pode", "consigo", "ótimo")):
        return Interpretacao("aceitou", None, "palavra de aceite", [])
    return Interpretacao("ambiguo", None, "sem palavra conhecida", [])


def atores_de_teste(cenario: Cenario, aprovar: bool = True, decidir=decidir_pelo_maior_valor) -> Atores:
    """Atores com o substituto, as respostas prontas do cenário e aprovação fixa."""
    return Atores(
        decidir=decidir,
        interpretar=interpretar_por_palavras,
        canal=CanalSimulado(cenario.respostas),
        aprovar=lambda *_: aprovar,
    )
