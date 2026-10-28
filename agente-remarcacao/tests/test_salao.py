import json
import shutil

import pytest

from paginas.icones import icone
from src.dados import PASTA_DADOS, ErroDados
from src.salao import (
    carregar_salao,
    cartoes_da_pagina,
    link_mapa,
    link_whatsapp,
    servicos_por_grupo,
)


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
    # o único caminho para o painel é a linha "Acesso da equipe" do rodapé
    assert texto.count('salao.get("link_equipe"') == 1 and "page_link" not in texto


def test_servicos_agrupados_e_sem_preco_tudo_bem():
    salao = {"servicos": [{"grupo": "Unhas", "nome": "Manicure"}, {"grupo": "Beleza", "nome": "Corte"},
                          {"grupo": "Unhas", "nome": "Pedicure"}, {"nome": "Sem grupo"}]}
    grupos = servicos_por_grupo(salao)
    assert list(grupos) == ["Unhas", "Beleza", "Serviços"]
    assert [s["nome"] for s in grupos["Unhas"]] == ["Manicure", "Pedicure"]


def test_dados_da_hospedagem_por_cima_de_tudo(tmp_path, monkeypatch):
    shutil.copy(PASTA_DADOS / "salao.json", tmp_path / "salao.json")
    monkeypatch.setenv("SALAO_JSON", json.dumps({"nome": "Santa Cor", "whatsapp": "5583900000000"}))
    salao = carregar_salao(tmp_path)
    assert salao["nome"] == "Santa Cor"
    assert "Santa%20Cor" not in link_mapa(salao)  # o mapa usa o endereço, não o nome


def test_cartao_de_servico_abre_o_whatsapp_com_o_pedido():
    salao = {"whatsapp": "5583993782040", "mensagem_whatsapp": "Oi!", "links": [
        {"titulo": "Agendar Horário", "mensagem": ""},
        {"titulo": "Alongamentos", "mensagem": "Olá, gostaria de agendar um horário para Alongamento. "},
        {"titulo": "Instagram", "link": "https://www.instagram.com/santacoresmalteriajp/"},
    ]}
    agendar, servico, instagram = (c["endereco"] for c in cartoes_da_pagina(salao))
    assert agendar == "https://wa.me/5583993782040"
    # igual ao link do site antigo do salão
    assert servico == ("https://wa.me/5583993782040?text=Ol%C3%A1%2C%20gostaria%20de%20agendar"
                       "%20um%20hor%C3%A1rio%20para%20Alongamento.%20")
    assert instagram == "https://www.instagram.com/santacoresmalteriajp/"


def test_sem_links_nos_dados_a_pagina_tem_os_cartoes_basicos():
    salao = carregar_salao()
    salao.pop("links", None)
    titulos = [c["titulo"] for c in cartoes_da_pagina(salao)]
    assert titulos[0] == "Agendar Horário" and "Localização" in titulos and "Todos os Serviços" in titulos


def test_icone_conhecido_vira_svg_e_o_resto_fica_como_texto():
    assert icone("gem").startswith("<svg") and icone("💅") == "💅"
