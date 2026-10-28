from src.acesso import senha_confere, senha_configurada


def test_senha_certa_e_errada():
    assert senha_confere("esmalte2026", senha="esmalte2026")
    assert not senha_confere("esmalte", senha="esmalte2026")
    assert not senha_confere("", senha="esmalte2026")


def test_sem_senha_configurada_libera_uso_local():
    assert senha_confere("qualquer coisa", senha="")


def test_senha_vem_do_ambiente(monkeypatch):
    monkeypatch.setenv("APP_SENHA", "  manicure  ")
    assert senha_configurada() == "manicure"  # espaços sobrando são ignorados
    monkeypatch.delenv("APP_SENHA")
    assert senha_configurada() == ""
