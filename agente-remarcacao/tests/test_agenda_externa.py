"""Regras que qualquer agenda externa (ex.: Google Agenda) precisa respeitar, testadas com uma falsa."""
import copy

import pytest

from src.agenda_externa import AgendaExterna
from src.cascata import tratar_cancelamento
from src.dados import carregar_cenario
from src.estado import Fluxo
from src.ferramentas import ErroMovimento, liberar_horario
from tests.substituto import atores_de_teste, decidir_pelo_maior_valor, interpretar_por_palavras


class AgendaFalsa(AgendaExterna):
    """Guarda o que receberia; pode ser configurada para falhar."""

    def __init__(self, falhar: bool = False):
        self.movimentos, self.falhar = [], falhar

    def carregar_slots(self, inicio, fim):
        return []

    def registrar_movimento(self, cliente_id, de, para):
        if self.falhar:
            raise ConnectionError("sem internet")
        self.movimentos.append((cliente_id, de.id, para.id))


def rodar(cenario_id: str, agenda: AgendaFalsa, aprovar: bool = True):
    c = copy.deepcopy(carregar_cenario(cenario_id))
    liberar_horario(c, c.slot_cancelado_id)
    atores = atores_de_teste(c, aprovar=aprovar)
    atores.agenda_externa = agenda
    return c, tratar_cancelamento(c, c.slot_cancelado_id, atores)


def test_cada_movimento_aprovado_vai_para_a_agenda_externa_na_ordem():
    agenda = AgendaFalsa()
    rodar("S2", agenda)
    assert agenda.movimentos == [("C09", "S2-04", "S2-02"), ("C10", "S2-05", "S2-04")]


def test_sem_movimento_nada_e_enviado():
    agenda = AgendaFalsa()
    rodar("S3", agenda)  # o agente decide não mexer
    assert agenda.movimentos == []


def test_recusa_e_rejeicao_nao_chegam_na_agenda_externa():
    recusa, rejeicao = AgendaFalsa(), AgendaFalsa()
    rodar("S4", recusa)
    rodar("S1", rejeicao, aprovar=False)
    assert recusa.movimentos == [("C14", "S4-03", "S4-02")]  # só a Marina, que aceitou
    assert rejeicao.movimentos == []


def test_falha_na_agenda_externa_desfaz_a_troca_local():
    with pytest.raises(ErroMovimento, match="agenda externa"):
        rodar("S1", AgendaFalsa(falhar=True))
    f = Fluxo(carregar_cenario("S1"), decidir_pelo_maior_valor, interpretar_por_palavras, AgendaFalsa(falhar=True))
    f.pedir_decisao()
    f.responder("Consigo sim!")
    with pytest.raises(ErroMovimento):
        f.aprovar()
    assert f.cenario.slot("S1-08").cliente_id == "C02"  # Beatriz continua no horário dela
    assert f.cenario.slot("S1-03").status == "livre"
    assert f.estado == "aguardando_aprovacao"  # dá para tentar aprovar de novo


def test_tela_tambem_avisa_a_agenda_externa():
    agenda = AgendaFalsa()
    f = Fluxo(carregar_cenario("S6"), decidir_pelo_maior_valor, interpretar_por_palavras, agenda)
    f.pedir_decisao()
    f.responder("Pode, prefiro hoje!")
    f.aprovar()
    assert agenda.movimentos == [("C15", "S6-05", "S6-02")]
