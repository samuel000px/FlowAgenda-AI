"""Partes que as páginas do painel compartilham: senha e menu lateral."""
import time

import streamlit as st

from src.acesso import senha_configurada, senha_confere


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
