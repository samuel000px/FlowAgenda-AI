"""Escolha pelo código: a primeira da lista, com justificativa e mensagem prontas, sem chamar a IA."""
import copy

import pytest

from avaliar_ia import problemas_da_mensagem
from src.dados import carregar_cenario, carregar_cenarios
from src.escolha import decidir_pelo_codigo
from src.ferramentas import buscar_candidatos, liberar_horario


def cancelado(cenario_id):
    c = copy.deepcopy(carregar_cenario(cenario_id))
    liberar_horario(c, c.slot_cancelado_id)
    return c


@pytest.mark.parametrize("cenario", carregar_cenarios(), ids=lambda c: c.id)
def test_escolhe_a_primeira_da_lista_e_a_mensagem_cumpre_as_regras(cenario):
    c = cancelado(cenario.id)
    elegiveis = [x for x in buscar_candidatos(c, c.slot_cancelado_id) if x.elegivel]
    d = decidir_pelo_codigo(c, c.slot_cancelado_id)
    if not elegiveis:
        assert d.cliente_id is None and d.mensagem is None
        return
    assert d.cliente_id == elegiveis[0].cliente_id
    vago = c.slot(c.slot_cancelado_id)
    nome = c.clientes[d.cliente_id].nome
    assert problemas_da_mensagem(d.mensagem, nome, vago.hora, c.nome_profissional(vago.profissional_id)) == []
    assert f"R$ {elegiveis[0].valor_esperado:.2f}".replace(".", ",") in d.justificativa


def test_quando_e_outra_profissional_a_mensagem_avisa():
    s7 = cancelado("S7")
    d = decidir_pelo_codigo(s7, "S7-02", recusados={"C20"})  # Talita recusou; sobra a Yasmin, que prefere a Lia
    assert d.cliente_id == "C21"
    assert "Seria com a Nina, não com a Lia" in d.mensagem


def test_mensagem_fala_hoje_e_o_dia_do_horario_dela():
    d = decidir_pelo_codigo(cancelado("S1"), "S1-03")
    assert d.mensagem.startswith("Oi, Beatriz! Abriu um horário hoje às 13:00")
    assert "sexta (30/10) às 10:00" in d.mensagem


def test_empate_e_explicado():
    from avaliacao_ia.casos_decisao import casos

    d2 = next(c for c in casos() if c.id == "D2").cenario
    d = decidir_pelo_codigo(d2, "V")
    assert "Empatada" in d.justificativa


def test_nao_chama_a_ia(monkeypatch):
    import src.agente as agente

    monkeypatch.setattr(agente, "rodar_com_ferramentas", lambda *a, **k: pytest.fail("chamou o modelo"))
    assert decidir_pelo_codigo(cancelado("S2"), "S2-02").cliente_id == "C09"
