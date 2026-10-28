"""Substituto da IA para os testes: interpreta respostas por palavras-chave. SÓ PARA TESTES.

Serve para testar a cascata sem gastar cota. Nunca usar o resultado disto como resultado do agente.
"""
from src.canal import CanalSimulado
from src.cascata import Atores
from src.escolha import decidir_pelo_codigo
from src.interpretacao import Interpretacao
from src.modelos import Cenario


def interpretar_por_palavras(proposta: str, resposta: str) -> Interpretacao:
    """Regra boba de palavras: "não" recusa; "sim", "pode", "consigo" aceitam."""
    texto = resposta.lower()
    if "não" in texto or "nao" in texto:
        return Interpretacao("recusou", None, "palavra 'não'", [])
    if any(p in texto for p in ("sim", "pode", "consigo", "ótimo")):
        return Interpretacao("aceitou", None, "palavra de aceite", [])
    return Interpretacao("ambiguo", None, "sem palavra conhecida", [])


def atores_de_teste(cenario: Cenario, aprovar: bool = True, decidir=decidir_pelo_codigo) -> Atores:
    """Atores com o substituto, as respostas prontas do cenário e aprovação fixa."""
    return Atores(
        decidir=decidir,
        interpretar=interpretar_por_palavras,
        canal=CanalSimulado(cenario.respostas),
        aprovar=lambda *_: aprovar,
    )
