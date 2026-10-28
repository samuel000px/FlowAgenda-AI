import copy

import pytest

from src.dados import carregar_cenario, carregar_cenarios
from src.ferramentas import (
    ErroMovimento,
    buscar_candidatos,
    confirmar_movimento,
    liberar_horario,
)
from src.filtros import motivo_de_exclusao


def cenario_cancelado(cenario_id):
    """Cópia do cenário com o cancelamento já feito."""
    c = copy.deepcopy(carregar_cenario(cenario_id))
    liberar_horario(c, c.slot_cancelado_id)
    return c


def motivo(cenario, cliente_id, recusados=()):
    vago = cenario.slot(cenario.slot_cancelado_id)
    slot_dela = cenario.agendamento_atual(cliente_id)
    return motivo_de_exclusao(cenario.clientes[cliente_id], slot_dela, vago, cenario.agora, recusados)


def test_quem_deu_nota_zero_nunca_e_chamada():
    s1 = cenario_cancelado("S1")
    assert motivo(s1, "C03") == "nao_quer"  # Luana disse que não quer trocar de horário
    assert motivo(s1, "C02") is None


def test_aviso_menor_que_o_minimo_nao_tenta_ninguem():
    s1 = cenario_cancelado("S1")  # 2h de aviso
    vago, beatriz = s1.slot("S1-03"), s1.agendamento_atual("C02")
    assert motivo_de_exclusao(s1.clientes["C02"], beatriz, vago, s1.agora, aviso_minimo_h=3) == "aviso_curto"
    assert motivo_de_exclusao(s1.clientes["C02"], beatriz, vago, s1.agora, aviso_minimo_h=1) is None


def test_servico_diferente_elimina():
    assert motivo(cenario_cancelado("S1"), "C04") == "tipo"


def test_quem_ja_esta_antes_nao_e_candidata():
    assert motivo(cenario_cancelado("S1"), "C14") == "nao_posterior"


def test_quem_recusou_nao_recebe_de_novo():
    s4 = cenario_cancelado("S4")
    assert motivo(s4, "C13", recusados={"C13"}) == "recusou"


def test_valor_esperado_negativo_e_podado():
    s1 = cenario_cancelado("S1")
    elisa = next(c for c in buscar_candidatos(s1, "S1-03") if c.cliente_id == "C06")
    assert elisa.valor_esperado < 0
    assert elisa.motivo == "valor_negativo"


@pytest.mark.parametrize("cenario", carregar_cenarios(), ids=lambda c: c.id)
def test_candidatos_batem_com_o_esperado(cenario):
    """Para cada cenário: quem fica de fora e quem aparece no topo."""
    c = cenario_cancelado(cenario.id)
    esperado = cenario.esperado
    candidatos = buscar_candidatos(c, c.slot_cancelado_id)
    por_id = {x.cliente_id: x for x in candidatos}

    for cliente_id, motivo_esperado in esperado["fora"].items():
        assert por_id[cliente_id].motivo == motivo_esperado, cliente_id

    primeiro = esperado["passos"][0]
    elegiveis = [x for x in candidatos if x.elegivel]
    if "escolha" in primeiro:
        assert elegiveis[0].cliente_id == primeiro["escolha"]
    else:
        assert elegiveis == []  # ninguém compensa: o agente não mexe


def test_recusa_passa_para_a_proxima():
    s4 = cenario_cancelado("S4")
    elegiveis = [x for x in buscar_candidatos(s4, "S4-02", recusados={"C13"}) if x.elegivel]
    assert elegiveis[0].cliente_id == "C14"


def test_lista_vem_ordenada_por_valor_esperado():
    s5 = cenario_cancelado("S5")
    elegiveis = [x for x in buscar_candidatos(s5, "S5-02") if x.elegivel]
    assert [x.cliente_id for x in elegiveis] == ["C07", "C08"]
    assert elegiveis[0].valor_esperado > elegiveis[1].valor_esperado
    assert elegiveis[0].taxa_falta == pytest.approx(0.4)  # 1 falta em 1 consulta


def test_confirmar_movimento_troca_e_devolve_o_novo_buraco():
    s1 = cenario_cancelado("S1")
    novo_buraco = confirmar_movimento(s1, "C02", "S1-03")
    assert novo_buraco.id == "S1-08" and novo_buraco.status == "livre"
    assert s1.slot("S1-03").cliente_id == "C02"


def test_confirmar_movimento_recusa_mudanca_invalida():
    s1 = cenario_cancelado("S1")
    with pytest.raises(ErroMovimento, match="Não quer ser chamada"):
        confirmar_movimento(s1, "C03", "S1-03")
    confirmar_movimento(s1, "C02", "S1-03")
    with pytest.raises(ErroMovimento, match="não está mais livre"):
        confirmar_movimento(s1, "C06", "S1-03")
