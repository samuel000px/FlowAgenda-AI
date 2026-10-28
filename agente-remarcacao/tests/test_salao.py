import json
import shutil

import pytest

from src.dados import PASTA_DADOS, ErroDados
from src.salao import carregar_salao, link_whatsapp


def test_link_abre_a_conversa_com_a_mensagem_escrita():
    link = link_whatsapp("+55 (11) 91234-5678", "Oi! Quero agendar um horário.")
    assert link == "https://wa.me/5511912345678?text=Oi%21%20Quero%20agendar%20um%20hor%C3%A1rio."
    assert link_whatsapp("5511912345678") == "https://wa.me/5511912345678"


def test_dados_reais_ficam_por_cima_do_exemplo(tmp_path):
    shutil.copy(PASTA_DADOS / "salao.json", tmp_path / "salao.json")
    (tmp_path / "salao.local.json").write_text(json.dumps({"nome": "Esmalteria da Tia", "whatsapp": "5511987654321"}), encoding="utf-8")
    salao = carregar_salao(tmp_path)
    assert salao["nome"] == "Esmalteria da Tia"
    assert salao["whatsapp"] == "5511987654321"
    assert salao["servicos"]  # o que não foi trocado continua vindo do exemplo


def test_numero_mal_escrito_gera_erro(tmp_path):
    shutil.copy(PASTA_DADOS / "salao.json", tmp_path / "salao.json")
    (tmp_path / "salao.local.json").write_text(json.dumps({"whatsapp": "(11) 98765-4321"}), encoding="utf-8")
    with pytest.raises(ErroDados, match="só números"):
        carregar_salao(tmp_path)


def test_pagina_publica_nao_le_clientes():
    texto = (PASTA_DADOS.parent / "paginas" / "inicio.py").read_text(encoding="utf-8")
    assert "carregar_clientes" not in texto and "carregar_cenarios" not in texto
    assert "/painel" not in texto and "page_link" not in texto  # nenhum caminho para o painel
