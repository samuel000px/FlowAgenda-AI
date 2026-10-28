import pytest

from src.dados import carregar_cenario, carregar_cenarios
from src.estado import Fluxo
from tests.substituto import decidir_pelo_maior_valor, interpretar_por_palavras
from tests.test_cascata import resumir


def fluxo(cenario_id: str) -> Fluxo:
    return Fluxo(carregar_cenario(cenario_id), decidir_pelo_maior_valor, interpretar_por_palavras)


@pytest.mark.parametrize("cenario", carregar_cenarios(), ids=lambda c: c.id)
def test_clicando_os_botoes_chega_no_mesmo_resultado_da_cascata(cenario):
    f = Fluxo(cenario, decidir_pelo_maior_valor, interpretar_por_palavras)
    while not f.terminou:
        if f.estado == "candidatos_calculados":
            f.pedir_decisao()
        elif f.estado == "aguardando_resposta":
            f.responder(cenario.respostas[f.cliente_atual])
        elif f.estado == "aguardando_aprovacao":
            f.aprovar()
    assert resumir(f.passos) == cenario.esperado["passos"]


def test_agenda_so_muda_depois_de_aprovar():
    f = fluxo("S1")
    f.pedir_decisao()
    f.responder("Consigo sim!")
    assert f.estado == "aguardando_aprovacao"
    assert f.cenario.slot("S1-08").cliente_id == "C02"  # ainda no horário dela
    f.aprovar()
    assert f.cenario.slot("S1-03").cliente_id == "C02"
    assert f.movimentos[0].de_slot_id == "S1-08"


def test_resposta_ambigua_pede_esclarecimento_uma_vez():
    f = fluxo("S1")
    f.pedir_decisao()
    f.responder("hmm, deixa eu ver")
    assert f.estado == "aguardando_resposta"
    assert "não entendi" in f.canal.conversa("C02")[-1].texto
    f.responder("talvez")
    assert f.passos[0].resultado == "recusou"  # continuou ambíguo: conta como recusa


def test_rejeitar_encerra_sem_mexer():
    f = fluxo("S1")
    f.pedir_decisao()
    f.responder("Pode sim")
    f.rejeitar()
    assert f.terminou and f.estado == "rejeitado"
    assert f.cenario.slot("S1-08").cliente_id == "C02"


def test_botao_fora_de_hora_da_erro():
    f = fluxo("S1")
    with pytest.raises(RuntimeError, match="fora de hora"):
        f.aprovar()


def test_nao_respondeu_encerra_com_educacao_e_passa_para_a_proxima():
    f = fluxo("S4")
    f.pedir_decisao()
    assert f.cliente_atual == "C13"
    f.sem_resposta()
    assert "Seu horário continua o mesmo" in f.canal.conversa("C13")[-1].texto
    assert f.passos[-1].resultado == "sem_resposta"
    assert f.cenario.slot("S4-04").cliente_id == "C13"  # nada mudou para ela
    f.pedir_decisao()
    assert f.cliente_atual == "C14"  # uma de cada vez: só agora a Marina é chamada
