import pytest

from src.modelos import Buraco, Cliente
from src.score import (
    dificuldade_de_preencher,
    disposicao_efetiva,
    prob_aceitar,
    taxa_falta,
    valor_esperado,
)


def cliente(**campos) -> Cliente:
    base = dict(
        id="X", nome="Teste", tipo_atendimento="manicure", duracao_min=45, consultas_total=10,
        faltas=0, propostas_recebidas=0, propostas_aceitas=0, disposicao=5,
    )
    return Cliente(**{**base, **campos})


def test_cliente_nova_com_uma_falta_nao_vira_cem_por_cento():
    assert taxa_falta(1, 1) == pytest.approx(0.4)
    assert taxa_falta(0, 0) == pytest.approx(0.25)


def test_quem_falta_muito_continua_com_taxa_alta():
    assert taxa_falta(5, 10) > taxa_falta(1, 1) > taxa_falta(0, 12)


def test_prob_aceitar_sem_historico_e_meio_a_meio():
    assert prob_aceitar(0, 0) == pytest.approx(0.5)
    assert prob_aceitar(3, 3) == pytest.approx(0.8)


def test_disposicao_da_cliente_vale_ate_o_historico_aparecer():
    assert prob_aceitar(0, 0, disposicao=9) == pytest.approx(0.9)
    assert prob_aceitar(0, 0, disposicao=2) == pytest.approx(0.2)
    assert prob_aceitar(0, 3, disposicao=9) == pytest.approx(0.36)  # recusou 3 de 3: o histórico pesa
    assert prob_aceitar(3, 3, disposicao=5) == prob_aceitar(3, 3)  # nota 5 = conta antiga


def test_dificuldade_vai_de_zero_a_um():
    assert dificuldade_de_preencher(48, 3) == pytest.approx(0)
    assert dificuldade_de_preencher(0, 0) == pytest.approx(1)
    assert dificuldade_de_preencher(500, 10) == pytest.approx(0)  # não passa do teto


def test_mais_aviso_e_mais_fila_facilitam():
    assert dificuldade_de_preencher(30, 2) < dificuldade_de_preencher(6, 2)
    assert dificuldade_de_preencher(30, 3) < dificuldade_de_preencher(30, 0)


def test_valor_esperado_negativo_quando_o_buraco_novo_e_dificil():
    pouco_confiavel = cliente(consultas_total=6, faltas=1, propostas_recebidas=3, propostas_aceitas=0)
    vago = Buraco(valor=45, antecedencia_h=2, fila=0)
    novo_dificil = Buraco(valor=45, antecedencia_h=6, fila=0)
    assert valor_esperado(pouco_confiavel, vago, novo_dificil) < 0


def test_nao_compensa_quando_o_horario_vago_ja_e_facil_de_preencher():
    confiavel = cliente(consultas_total=12, propostas_recebidas=4, propostas_aceitas=3)
    vago_facil = Buraco(valor=45, antecedencia_h=72, fila=3)  # a fila resolve sozinha
    novo = Buraco(valor=45, antecedencia_h=72, fila=3)
    assert valor_esperado(confiavel, vago_facil, novo) < 0  # só somaria o risco de ela faltar


def test_valor_esperado_positivo_quando_o_buraco_novo_se_preenche_sozinho():
    confiavel = cliente(consultas_total=12, propostas_recebidas=4, propostas_aceitas=3)
    vago = Buraco(valor=45, antecedencia_h=2, fila=0)
    novo_facil = Buraco(valor=45, antecedencia_h=72, fila=3)
    assert valor_esperado(confiavel, vago, novo_facil) > 0


def test_sem_procura_o_aviso_nao_ajuda():
    cheio, vazio = dificuldade_de_preencher(48, 0, ocupacao_pct=90), dificuldade_de_preencher(48, 0, ocupacao_pct=40)
    assert cheio == pytest.approx(0.4)  # 80% ou mais conta como procura normal
    assert vazio == pytest.approx(1 - 0.6 * 0.5)  # metade da procura, metade da ajuda do aviso
    assert dificuldade_de_preencher(48, 3, ocupacao_pct=10) < vazio  # fila ainda ajuda


def test_quem_marcou_tarde_de_proposito_entra_com_nota_baixa():
    normal = cliente(disposicao=6)
    assert disposicao_efetiva(normal, escolheu_tarde=True) == 2
    assert disposicao_efetiva(normal, escolheu_tarde=False) == 6
    assert disposicao_efetiva(cliente(disposicao=9), escolheu_tarde=True) == 9  # disse que quer antes: vale
    assert disposicao_efetiva(cliente(disposicao=1), escolheu_tarde=True) == 1  # não sobe quem já era baixa


def test_marcar_tarde_derruba_o_valor_esperado():
    c = cliente(consultas_total=12, propostas_recebidas=0, propostas_aceitas=0, disposicao=6)
    vago, novo = Buraco(45, 5, 0), Buraco(45, 72, 3)
    assert valor_esperado(c, vago, novo, escolheu_tarde=True) < valor_esperado(c, vago, novo)
