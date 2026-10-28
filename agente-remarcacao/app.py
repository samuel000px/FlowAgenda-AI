"""Entrada do site: página pública na raiz e o painel do salão em /painel, sem link e com senha.

Rodar com:  streamlit run app.py
"""
import streamlit as st

from src.salao import carregar_salao

nome_do_salao = carregar_salao()["nome"]
st.set_page_config(page_title=nome_do_salao, page_icon="💅", layout="wide")

paginas = [
    st.Page("paginas/inicio.py", title=nome_do_salao, default=True),
    st.Page("paginas/painel.py", title="Painel", url_path="painel"),
    st.Page("paginas/cadastro.py", title="Clientes e equipe", url_path="equipe"),
]
# position="hidden": nenhum menu aparece. Quem chega pela página pública não vê o caminho para o painel.
st.navigation(paginas, position="hidden").run()
