"""Partes da Fase 4 que dá para testar sem chamar o Gemini."""
import pytest

from src.agente import _validar
from src.canal import CanalSimulado
from src.interpretacao import _validar as validar_interpretacao
from src.llm import ErroFormato, extrair_json


def test_extrair_json_tira_cercas_de_markdown():
    texto = '```json\n{"cliente_id": "C02", "justificativa": "ok"}\n```'
    assert extrair_json(texto)["cliente_id"] == "C02"


def test_extrair_json_falha_com_mensagem_clara():
    with pytest.raises(ErroFormato, match="não devolveu JSON"):
        extrair_json("Escolhi a Beatriz.")


def test_modelo_nao_pode_escolher_cliente_fora_da_lista():
    with pytest.raises(ErroFormato, match="não estava na lista"):
        _validar({"cliente_id": "C99", "justificativa": "x", "mensagem": "oi"}, {"C02"}, [])


def test_modelo_pode_decidir_nao_mexer():
    decisao = _validar({"cliente_id": None, "justificativa": "ninguém compensa"}, {"C02"}, [])
    assert decisao.cliente_id is None


def test_interpretacao_rejeita_resultado_desconhecido():
    with pytest.raises(ErroFormato):
        validar_interpretacao({"resultado": "talvez"}, [])


def test_janela_mal_formada_e_ignorada():
    interp = validar_interpretacao({"resultado": "outro_horario", "janela_preferida": {"apos": "16h"}}, [])
    assert interp.janela_preferida is None


def test_canal_simulado_usa_resposta_pronta_uma_vez():
    canal = CanalSimulado({"C02": "Consigo sim!"})
    canal.enviar("C02", "Abriu um horário hoje às 13h.")
    assert canal.receber("C02") == "Consigo sim!"
    canal.enviar("C02", "Confirma?")
    assert canal.receber("C02") is None  # a resposta pronta já foi usada
    assert [m.de for m in canal.conversa("C02")] == ["agente", "cliente", "agente"]
