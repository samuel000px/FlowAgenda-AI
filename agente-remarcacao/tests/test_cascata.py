import copy
from datetime import datetime

import pytest

import src.agente as agente
from src.cascata import MAX_PROF, tratar_cancelamento
from src.dados import carregar_cenario, carregar_cenarios, carregar_clientes
from src.ferramentas import buscar_candidatos, liberar_horario
from src.llm import Resultado
from src.modelos import Cenario, Decisao, Dia, Slot
from tests.substituto import atores_de_teste


def rodar(cenario: Cenario, **opcoes):
    c = copy.deepcopy(cenario)
    liberar_horario(c, c.slot_cancelado_id)
    return c, tratar_cancelamento(c, c.slot_cancelado_id, atores_de_teste(c, **opcoes))


def resumir(passos):
    """Mesmo formato de esperado.passos no cenarios.json."""
    saida = []
    for p in passos:
        if p.cliente_id and p.resultado in ("aceitou", "recusou"):
            saida.append({"profundidade": p.profundidade, "slot_id": p.slot_id, "escolha": p.cliente_id, "resposta": p.resultado})
        else:
            saida.append({"profundidade": p.profundidade, "slot_id": p.slot_id, "resultado": p.resultado})
    return saida


@pytest.mark.parametrize("cenario", carregar_cenarios(), ids=lambda c: c.id)
def test_cascata_segue_o_esperado(cenario):
    _, passos = rodar(cenario)
    assert resumir(passos) == cenario.esperado["passos"]


def test_cascata_que_nao_compensa_explica_por_que():
    _, passos = rodar(carregar_cenario("S3"))
    assert passos[-1].resultado == "nao_agir"
    assert "Não compensa" in passos[-1].justificativa


def test_recusa_nao_mexe_na_agenda_de_quem_recusou():
    c, passos = rodar(carregar_cenario("S4"))
    assert passos[0].resultado == "recusou"
    assert c.slot("S4-04").cliente_id == "C13"  # Larissa continua na segunda


def test_sem_aprovacao_a_agenda_nao_muda():
    c, passos = rodar(carregar_cenario("S1"), aprovar=False)
    assert passos[-1].resultado == "rejeitado"
    assert c.slot("S1-08").cliente_id == "C02"  # Beatriz continua no horário dela
    assert c.slot("S1-03").status == "livre"


def test_modelo_pode_decidir_nao_mexer():
    nunca = lambda *_: Decisao(None, "prefiro não mexer", None, [])
    _, passos = rodar(carregar_cenario("S1"), decidir=nunca)
    assert [p.resultado for p in passos] == ["nao_agir"]
    assert passos[0].justificativa == "prefiro não mexer"


def cenario_em_corrente() -> Cenario:
    """Cada horário vago tem uma candidata logo depois, sempre compensando: a cascata só para no limite."""
    horarios = [("X", "C16", "2026-10-28", "10:00"), ("A", "C02", "2026-10-28", "20:00"),
                ("B", "C09", "2026-10-29", "08:00"), ("C", "C13", "2026-10-29", "20:00"),
                ("D", "C15", "2026-10-30", "08:00")]
    agenda = [Slot(i, d, h, 45, "manicure", "ocupado", c, 45) for i, c, d, h in horarios]
    dias = {d: Dia(50, 0) for d in ("2026-10-28", "2026-10-29", "2026-10-30")}
    respostas = {c: "sim, consigo" for _, c, _, _ in horarios}
    return Cenario("T", "Corrente", "limite", datetime(2026, 10, 28, 8), "X", carregar_clientes(), agenda, dias, respostas, {})


def test_cascata_para_no_limite_de_profundidade():
    def mais_cedo(cenario, slot_id, recusados, profundidade):
        elegiveis = [x for x in buscar_candidatos(cenario, slot_id, recusados) if x.elegivel]
        primeira = min(elegiveis, key=lambda x: cenario.slot(x.slot_atual_id).inicio)
        return Decisao(primeira.cliente_id, "a mais cedo", "Oi, quer vir?", [])

    _, passos = rodar(cenario_em_corrente(), decidir=mais_cedo)
    assert [p.resultado for p in passos] == ["aceitou"] * (MAX_PROF + 1) + ["limite"]
    assert passos[-1].profundidade == MAX_PROF + 1


def test_modelo_nunca_recebe_confirmar_movimento(monkeypatch):
    vistas = []

    def falso(sistema, pedido, ferramentas, max_passos=8):
        vistas.extend(f.nome for f in ferramentas)
        return Resultado('{"cliente_id": null, "justificativa": "teste"}', [])

    monkeypatch.setattr(agente, "rodar_com_ferramentas", falso)
    c = copy.deepcopy(carregar_cenario("S1"))
    liberar_horario(c, "S1-03")
    agente.decidir(c, "S1-03")
    assert sorted(vistas) == ["buscar_candidatos", "propor_remarcacao"]
