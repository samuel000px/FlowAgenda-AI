"""Várias profissionais: primeiro quem prefere a profissional do horário vago."""
import copy

from avaliacao_ia import escolha_com_ia as agente
from src.dados import carregar_cenario
from src.ferramentas import buscar_candidatos, liberar_horario
from src.llm import Resultado


def s7_cancelado():
    c = copy.deepcopy(carregar_cenario("S7"))
    liberar_horario(c, "S7-02")
    return c


def test_preferida_vem_antes_mesmo_com_valor_esperado_menor():
    elegiveis = [x for x in buscar_candidatos(s7_cancelado(), "S7-02") if x.elegivel]
    talita, yasmin = elegiveis
    assert (talita.cliente_id, yasmin.cliente_id) == ("C20", "C21")
    assert talita.mesma_profissional and not yasmin.mesma_profissional
    assert yasmin.valor_esperado > talita.valor_esperado  # Yasmin tem números melhores, mas prefere a Lia


def test_quem_nao_tem_preferencia_entra_no_primeiro_grupo():
    s1 = copy.deepcopy(carregar_cenario("S1"))
    liberar_horario(s1, "S1-03")
    beatriz = next(x for x in buscar_candidatos(s1, "S1-03") if x.cliente_id == "C02")
    assert beatriz.mesma_profissional  # sem preferência: qualquer profissional serve


def capturar_o_que_o_modelo_ve(monkeypatch, cenario, slot_id, recusados=()):
    visto = {}

    def falso(sistema, pedido, ferramentas, max_passos=8):
        buscar = next(f for f in ferramentas if f.nome == "buscar_candidatos")
        visto.update(buscar.funcao(slot_id))
        return Resultado('{"cliente_id": null, "justificativa": "teste"}', [])

    monkeypatch.setattr(agente, "rodar_com_ferramentas", falso)
    agente.decidir(cenario, slot_id, recusados)
    return visto


def test_modelo_so_ve_quem_prefere_a_profissional_do_horario(monkeypatch):
    visto = capturar_o_que_o_modelo_ve(monkeypatch, s7_cancelado(), "S7-02")
    assert [c["cliente_id"] for c in visto["candidatas"]] == ["C20"]
    assert visto["horario_livre"]["profissional"] == "Nina"


def test_quando_o_grupo_acaba_o_modelo_ve_as_outras(monkeypatch):
    visto = capturar_o_que_o_modelo_ve(monkeypatch, s7_cancelado(), "S7-02", recusados={"C20"})
    assert [c["cliente_id"] for c in visto["candidatas"]] == ["C21"]
    assert visto["candidatas"][0]["profissional_preferida"] == "Lia"
    assert visto["candidatas"][0]["prefere_a_profissional_deste_horario"] is False
