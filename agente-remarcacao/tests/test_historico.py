"""Registro de visitas, faltas e propostas."""
from datetime import datetime

import pytest

from src.dados import carregar_cenario, carregar_clientes
from src.escolha import decidir_pelo_codigo
from src.estado import Fluxo
from src.historico import Historico, aplicar
from tests.substituto import interpretar_por_palavras


def test_registro_grava_uma_linha_por_evento_e_le_de_volta(tmp_path):
    h = Historico(tmp_path / "registro" / "historico.csv")
    h.registrar("C07", "veio", "S5-04", quando=datetime(2026, 11, 2, 11, 45))
    h.registrar("C07", "faltou", "S5-09")
    eventos = h.eventos()
    assert [(e["cliente_id"], e["evento"]) for e in eventos] == [("C07", "veio"), ("C07", "faltou")]
    assert eventos[0]["data_hora"] == "2026-11-02T11:45"
    assert h.presenca_marcada("S5-04") == "veio" and h.presenca_marcada("S1-01") is None


def test_evento_desconhecido_nao_e_gravado(tmp_path):
    h = Historico(tmp_path / "h.csv")
    with pytest.raises(ValueError, match="Evento desconhecido"):
        h.registrar("C07", "chegou_atrasada")
    assert h.eventos() == []


def test_numeros_da_cliente_sao_cadastro_mais_registro():
    clientes = carregar_clientes()
    eventos = [
        {"cliente_id": "C07", "evento": "veio"},
        {"cliente_id": "C07", "evento": "veio"},
        {"cliente_id": "C07", "evento": "faltou"},
        {"cliente_id": "C07", "evento": "proposta_aceita"},
        {"cliente_id": "C07", "evento": "proposta_sem_resposta"},
        {"cliente_id": "C99", "evento": "veio"},  # cliente que não existe: ignorada
    ]
    fernanda = aplicar(clientes, eventos)["C07"]
    assert (fernanda.consultas_total, fernanda.faltas) == (1 + 3, 1 + 1)
    assert (fernanda.propostas_recebidas, fernanda.propostas_aceitas) == (0 + 2, 0 + 1)
    assert clientes["C07"].consultas_total == 1  # o cadastro original não muda


def test_tela_registra_as_propostas_sozinha(tmp_path):
    h = Historico(tmp_path / "h.csv")
    f = Fluxo(carregar_cenario("S4"), decidir_pelo_codigo, interpretar_por_palavras, historico=h)
    f.pedir_decisao()
    f.responder("Ah, hoje não vou conseguir.")  # Larissa recusa
    f.pedir_decisao()
    f.sem_resposta()  # Marina não responde
    assert [(e["cliente_id"], e["evento"]) for e in h.eventos()] == [
        ("C13", "proposta_recusada"),
        ("C14", "proposta_sem_resposta"),
    ]


def test_sem_historico_nada_e_gravado():
    f = Fluxo(carregar_cenario("S1"), decidir_pelo_codigo, interpretar_por_palavras)
    f.pedir_decisao()
    f.responder("Consigo sim!")
    assert f.historico.eventos() == []
