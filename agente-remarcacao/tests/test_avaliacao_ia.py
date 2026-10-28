"""Confere o próprio conjunto de avaliação, sem chamar o Gemini."""
import json
from pathlib import Path

from avaliacao_ia.casos_decisao import casos
from avaliar_ia import problemas_da_mensagem
from src.ferramentas import buscar_candidatos
from src.interpretacao import RESULTADOS

PASTA = Path(__file__).resolve().parent.parent / "avaliacao_ia"


def test_casos_de_interpretacao_usam_so_classificacoes_que_existem():
    dados = json.loads((PASTA / "casos_interpretacao.json").read_text(encoding="utf-8"))
    assert len(dados["casos"]) >= 20
    for caso in dados["casos"]:
        assert caso["aceitas"] and set(caso["aceitas"]) <= set(RESULTADOS), caso


def test_cada_situacao_aceita_o_topo_do_codigo():
    for caso in casos():
        elegiveis = [c for c in buscar_candidatos(caso.cenario, "V") if c.elegivel]
        assert elegiveis, caso.id
        assert elegiveis[0].cliente_id in caso.aceitas, caso.id


def test_armadilhas_estao_montadas_como_prometido():
    por_id = {c.id: c for c in casos()}
    d2 = [c for c in buscar_candidatos(por_id["D2"].cenario, "V") if c.elegivel]
    assert d2[0].valor_esperado == d2[1].valor_esperado  # empate exato
    d3 = [c for c in buscar_candidatos(por_id["D3"].cenario, "V") if c.elegivel]
    assert d3[0].cliente_id == "F" and por_id["D3"].cenario.clientes["E"].disposicao == 10  # a nota 10 perde
    d5 = [c for c in buscar_candidatos(por_id["D5"].cenario, "V") if c.elegivel]
    assert 0 < d5[0].valor_esperado < 1  # margem mínima


def test_regras_da_mensagem():
    boa = "Oi, Ana! Abriu um horário hoje às 14:00 com a Nina. Quer antecipar? Se preferir, pode manter o seu."
    assert problemas_da_mensagem(boa, "Ana Prado", "14:00", "Nina") == []
    ruim = "Oi, Ana Prado! Abriu uma vaga, quem responder primeiro leva."
    assert set(problemas_da_mensagem(ruim, "Ana Prado", "14:00", "Nina")) == {
        "não diz a hora", "não diz a profissional", "não oferece manter o horário",
        "usa o sobrenome", "fala em quem responder primeiro",
    }


def test_continuar_no_horario_conta_como_oferecer_manter():
    msg = "Oi, Fabi! Abriu um horário às 14:00 com a Nina. Se preferir continuar no seu horário, sem problemas!"
    assert problemas_da_mensagem(msg, "Fabi Rangel", "14:00", "Nina") == []
