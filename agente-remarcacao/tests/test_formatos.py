"""Textos das telas: o painel não pode quebrar com horário livre ou dia sem horários."""
import copy

from paginas.formatos import descrever_horario, nome_do_dia, sem_formula
from src.dados import carregar_cenario
from src.ferramentas import confirmar_movimento, liberar_horario
from src.modelos import Slot


def test_horario_que_ja_comecou_livre_nao_quebra():
    original = carregar_cenario("S1")
    livre = Slot("L1", "2026-10-28", "15:00", 45, "manicure", "livre", None, 45, "P1")
    assert descrever_horario(livre, livre, original, original) == "livre"


def test_cancelado_antecipada_e_horario_vago():
    original = carregar_cenario("S1")
    atual = copy.deepcopy(original)
    liberar_horario(atual, "S1-03")
    confirmar_movimento(atual, "C02", "S1-03")
    cancelado = descrever_horario(original.slot("S1-03"), atual.slot("S1-03"), original, atual)
    deixado = descrever_horario(original.slot("S1-08"), atual.slot("S1-08"), original, atual)
    assert cancelado == "~~Ana Lima~~ cancelou → **Beatriz Alves** (antecipada)"
    assert deixado.startswith("~~Beatriz Alves~~ antecipada → :orange[**horário vago**]")


def test_nome_do_dia_nao_depende_de_ter_horario():
    assert nome_do_dia("2026-11-01") == "dom 01/11"


def test_cifrao_nao_vira_formula():
    assert sem_formula("R$ 10 e R$ 20") == r"R\$ 10 e R\$ 20"
