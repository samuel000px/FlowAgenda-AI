import json
import shutil

import pytest

from src.dados import PASTA_DADOS, ErroDados, carregar_cenario, carregar_cenarios


def test_carrega_os_sete_cenarios():
    cenarios = carregar_cenarios()
    assert [c.id for c in cenarios] == ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]
    assert cenarios[0].profissionais == {"P1": "Lia", "P2": "Nina", "P3": "Rafa"}


def test_agendamento_atual_vem_da_agenda_do_cenario():
    s1 = carregar_cenario("S1")
    assert s1.agendamento_atual("C02").id == "S1-08"
    assert s1.agendamento_atual("C07") is None  # Fernanda não tem horário no cenário 1


def test_dado_inconsistente_gera_erro_legivel(tmp_path):
    for nome in ("profissionais.json", "clientes.json", "agenda.json", "cenarios.json"):
        shutil.copy(PASTA_DADOS / nome, tmp_path / nome)
    clientes = json.loads((tmp_path / "clientes.json").read_text(encoding="utf-8"))
    clientes[0]["faltas"] = 99  # mais faltas do que consultas
    (tmp_path / "clientes.json").write_text(json.dumps(clientes), encoding="utf-8")

    with pytest.raises(ErroDados, match="faltas"):
        carregar_cenarios(tmp_path)


def test_profissional_que_nao_existe_gera_erro(tmp_path):
    for nome in ("profissionais.json", "clientes.json", "agenda.json", "cenarios.json"):
        shutil.copy(PASTA_DADOS / nome, tmp_path / nome)
    clientes = json.loads((tmp_path / "clientes.json").read_text(encoding="utf-8"))
    clientes[0]["profissional_preferida"] = "P9"
    (tmp_path / "clientes.json").write_text(json.dumps(clientes), encoding="utf-8")

    with pytest.raises(ErroDados, match="P9"):
        carregar_cenarios(tmp_path)
