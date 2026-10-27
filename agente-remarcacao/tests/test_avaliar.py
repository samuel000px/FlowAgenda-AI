"""A parte da avaliação que não depende do Gemini."""
import avaliar
from src.dados import carregar_cenario


def test_regra_ingenua_segue_a_ordem_cronologica_sem_poda():
    s1 = avaliar.cancelado(carregar_cenario("S1"))
    assert avaliar.fila_ingenua(s1, "S1-03", set()) == ["C06", "C02"]  # Elisa (podada pelo agente) vem antes


def test_regra_ingenua_ignora_o_dia_lotado():
    s6 = avaliar.cancelado(carregar_cenario("S6"))
    assert avaliar.fila_ingenua(s6, "S6-02", set())[0] == "C16"  # Olívia, do dia vazio


def test_bate_com_esperado():
    from src.cascata import Passo

    s3 = carregar_cenario("S3")
    assert avaliar.bate_com_esperado([Passo(0, "S3-02", "nao_agir")], s3.esperado["passos"])
    assert not avaliar.bate_com_esperado([Passo(0, "S3-02", "aceitou", "C11")], s3.esperado["passos"])
