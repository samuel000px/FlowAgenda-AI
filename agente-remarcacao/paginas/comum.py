"""Partes que as páginas compartilham: estilo, senha e menu lateral do painel."""
import time
from pathlib import Path

import streamlit as st

from src.acesso import senha_confere, senha_configurada

PASTA_ESTILOS = Path(__file__).resolve().parent / "estilos"


def aplicar_css(nome: str) -> None:
    """Lê paginas/estilos/<nome>.css e aplica na página."""
    css = (PASTA_ESTILOS / f"{nome}.css").read_text(encoding="utf-8")
    # Sem linhas em branco: no markdown do Streamlit, linha em branco pode quebrar o bloco <style>.
    linhas = [linha for linha in css.splitlines() if linha.strip()]
    st.markdown("<style>" + "\n".join(linhas) + "</style>", unsafe_allow_html=True)


def exigir_senha() -> None:
    """Sem a senha certa, o resto da página nem é desenhado."""
    if not senha_configurada():
        st.warning("Painel sem senha: use só no seu computador. Para publicar, configure APP_SENHA (docs/hospedagem.md).")
        return
    if st.session_state.get("autenticado"):
        return

    st.markdown("### Painel do salão")
    with st.form("entrar"):
        digitada = st.text_input("Senha", type="password")
        if st.form_submit_button("Entrar", type="primary"):
            if senha_confere(digitada):
                st.session_state.autenticado = True
                st.rerun()
            time.sleep(1)  # deixa mais lento quem tenta adivinhar a senha
            st.error("Senha errada.")
    st.stop()


def menu_do_painel() -> None:
    """Links entre as páginas do painel. A página pública não tem link para cá."""
    st.sidebar.page_link("paginas/painel.py", label="Remarcação")
    st.sidebar.page_link("paginas/cadastro.py", label="Clientes e equipe")
    if senha_configurada() and st.sidebar.button("Sair"):
        st.session_state.clear()
        st.rerun()
    st.sidebar.divider()
