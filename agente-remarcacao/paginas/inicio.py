"""Página pública do salão: serviços, endereço e o botão para agendar pelo WhatsApp.

Não mostra nada das clientes e não tem link para o painel. O visual (paginas/estilos/inicio.css)
segue a identidade da Santa Cor: fundo perolado, nome em caixa alta, monograma e dourado rosé.
"""
from html import escape

import streamlit as st

from paginas.comum import aplicar_css
from src.salao import (
    carregar_salao,
    link_mapa,
    link_whatsapp,
    servicos_por_grupo,
    telefone_formatado,
)


def link(endereco: str, texto: str, classe: str = "") -> str:
    """Link que abre em outra aba."""
    atributo = f' class="{classe}"' if classe else ""
    return f'<a{atributo} href="{endereco}" target="_blank" rel="noopener">{texto}</a>'


def cartao(salao: dict, agendar: str) -> str:
    """O bloco de cima: monograma, nome, frase, botão do WhatsApp e telefone."""
    return f"""
    <div class="cartao">
      <div class="monograma" aria-hidden="true">{escape(salao.get("monograma", ""))}</div>
      <h1>{escape(salao["nome"])}</h1>
      <div class="subtitulo">{escape(salao.get("subtitulo", ""))}</div>
      <div class="ornamento" aria-hidden="true">✦</div>
      <p class="frase">{escape(salao["frase"])}</p>
      {link(agendar, "Agendar pelo WhatsApp", "agendar")}
      <p class="telefone">{link(agendar, telefone_formatado(salao["whatsapp"]))}</p>
    </div>"""


def servicos(salao: dict) -> str:
    """Uma seção por grupo (Unhas, Beleza). Duração e preço só aparecem se estiverem no cadastro."""
    secoes = []
    for grupo, itens in servicos_por_grupo(salao).items():
        linhas = []
        for s in itens:
            extras = ""
            if s.get("duracao_min"):
                extras += f'<span class="dur">{s["duracao_min"]} min</span>'
            if s.get("preco"):
                extras += f'<span class="preco">R$ {s["preco"]}</span>'
            linhas.append(f'<li><span class="nome">{escape(s["nome"])}</span>{extras}</li>')
        secoes.append(f'<section class="servicos"><h2>{escape(grupo)}</h2><ul>{"".join(linhas)}</ul></section>')
    return "".join(secoes)


def equipe(salao: dict) -> str:
    """Só aparece se o salão informou a equipe."""
    nomes = salao.get("equipe") or []
    if not nomes:
        return ""
    lista = nomes[0] if len(nomes) == 1 else f"{', '.join(nomes[:-1])} e {nomes[-1]}"
    return (
        f"<section><h2>Quem atende</h2><p>{escape(lista)}. "
        "Se você tem preferência por alguém, é só dizer na mensagem.</p></section>"
    )


def onde_fica(salao: dict, agendar: str) -> str:
    """Endereço, mapa, horários e Instagram."""
    if salao.get("horarios"):
        itens = "".join(f"<li><span>{escape(h['dias'])}</span><span>{escape(h['horas'])}</span></li>" for h in salao["horarios"])
        horarios = f'<ul class="horarios">{itens}</ul>'
    else:
        horarios = f"<p>Combine o melhor horário {link(agendar, 'pelo WhatsApp')}.</p>"

    instagram = ""
    if salao.get("instagram"):
        usuario = escape(salao["instagram"])
        instagram = f"<p>{link(f'https://instagram.com/{usuario}', f'@{usuario}')} no Instagram</p>"

    return f"""
    <section>
      <h2>Onde fica</h2>
      <p>{escape(salao["endereco"])}<br>{escape(salao["bairro_cidade"])}</p>
      <p>{link(link_mapa(salao), "Ver no mapa")}</p>
      {horarios}
      {instagram}
    </section>"""


salao = carregar_salao()
agendar = link_whatsapp(salao["whatsapp"], salao["mensagem_whatsapp"])
remarcar = link_whatsapp(salao["whatsapp"], "Oi! Preciso remarcar meu horário.")

pagina = f"""
<div class="vitrine">
  {cartao(salao, agendar)}
  {servicos(salao)}
  {equipe(salao)}
  {onde_fica(salao, agendar)}
  <p class="rodape">Precisa remarcar? {link(remarcar, "Fale com a gente no WhatsApp")}.</p>
</div>"""

aplicar_css("inicio")
# No markdown do Streamlit, linha com recuo vira bloco de código; tudo numa linha só evita isso.
st.markdown(" ".join(linha.strip() for linha in pagina.splitlines() if linha.strip()), unsafe_allow_html=True)
