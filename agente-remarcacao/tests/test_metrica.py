import copy

import pytest

from src.dados import carregar_cenario
from src.ferramentas import confirmar_movimento, liberar_horario
from src.metrica import horas_vagas_esperadas


def test_sem_mexer_conta_so_o_horario_cancelado():
    original = carregar_cenario("S1")
    final = copy.deepcopy(original)
    liberar_horario(final, "S1-03")
    # 45 min, 2h de aviso, sem fila: dificuldade 0,975
    assert horas_vagas_esperadas(original, final) == pytest.approx(0.75 * 0.975)


def test_mover_conta_a_falta_de_quem_veio_e_o_buraco_novo():
    original = carregar_cenario("S1")
    final = copy.deepcopy(original)
    liberar_horario(final, "S1-03")
    confirmar_movimento(final, "C02", "S1-03")
    beatriz_falta = 1 / 16  # 0 faltas em 12
    buraco_novo = 1 - (0.6 * 47 / 48 + 0.4 * 2 / 3)  # 47h de aviso, 2 na fila
    assert horas_vagas_esperadas(original, final) == pytest.approx(0.75 * (beatriz_falta + buraco_novo))


def test_mover_quem_nao_compensa_piora_a_metrica():
    original = carregar_cenario("S3")
    parado = copy.deepcopy(original)
    liberar_horario(parado, "S3-02")
    mexido = copy.deepcopy(parado)
    confirmar_movimento(mexido, "C11", "S3-02")
    assert horas_vagas_esperadas(original, mexido) > horas_vagas_esperadas(original, parado)
