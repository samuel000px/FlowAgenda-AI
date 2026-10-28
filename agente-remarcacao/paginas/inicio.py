"""Página pública do salão, no estilo "link na bio": cartões que levam ao WhatsApp, mapa e Instagram.

Não mostra nada das clientes. O único caminho para o painel da equipe é a linha discreta "Acesso da
equipe" no rodapé; o endereço dela vem de "link_equipe" nos dados (sem ele, o /painel daqui). O
conteúdo vem de data/salao.json (ou salao.local.json); cada seção só aparece se tiver conteúdo. O
visual está em paginas/estilos/inicio.css e os ícones em paginas/icones.py.
"""
from html import escape

import streamlit as st

from paginas.comum import aplicar_css
from paginas.icones import icone
from src.salao import (
    carregar_salao,
    cartoes_da_pagina,
    link_whatsapp,
    servicos_por_grupo,
)


def link(endereco: str, conteudo: str, classe: str = "") -> str:
    """Um <a>; o que sai do site (WhatsApp, mapa, Instagram) abre em outra aba."""
    alvo = 'target="_blank" rel="noopener"' if endereco.startswith("http") else 'target="_self"'
    return f'<a class="{classe}" href="{escape(endereco)}" {alvo}>{conteudo}</a>'


def cartao(endereco: str, nome_icone: str, titulo: str, subtitulo: str) -> str:
    """Cartão clicável: ícone, título, subtítulo e seta."""
    miolo = (
        f'<span class="icone">{icone(nome_icone)}</span>'
        f'<span class="textos"><strong>{escape(titulo)}</strong><small>{escape(subtitulo)}</small></span>'
        '<span class="seta">→</span>'
    )
    return link(endereco, miolo, "cartao")


def topo(salao: dict) -> str:
    """Logo, nome, especialidade, frase e os selos."""
    selos = "".join(f"<span>{escape(d)}</span>" for d in salao.get("destaques", []))
    return f"""
    <header class="topo">
      <div class="logo" aria-hidden="true"><span class="mono">{escape(salao.get("monograma", ""))}</span>
        <span class="logo-nome">{escape(salao["nome"])}</span></div>
      <p class="selo">{escape(salao.get("selo", ""))}</p>
      <h1>{escape(salao["nome"])}<em>{escape(salao.get("subtitulo", ""))}</em></h1>
      <p class="especialidade">{escape(salao.get("especialidade", ""))}</p>
      <p class="frase">{escape(salao["frase"])}</p>
      <div class="selos">{selos}</div>
    </header>"""


def cartoes(itens: list[dict]) -> str:
    """A pilha de cartões (agendar, serviços, galeria, mapa...)."""
    blocos = "".join(cartao(c["endereco"], c.get("icone", ""), c["titulo"], c.get("subtitulo", "")) for c in itens)
    return f'<nav class="cartoes">{blocos}</nav>'


def diferenciais(salao: dict) -> str:
    """Grade de dois em dois."""
    itens = salao.get("diferenciais", [])
    if not itens:
        return ""
    blocos = "".join(f'<div class="caixa">{icone(d["icone"])}<p>{escape(d["texto"])}</p></div>' for d in itens)
    return f"""
    <section>
      <p class="rotulo">Nossos diferenciais</p>
      <h2>Feito com <em>carinho</em></h2>
      <div class="grade">{blocos}</div>
    </section>"""


def textos(salao: dict) -> str:
    """Os cartões de texto: o espaço, "para você", o cartão escuro e o depoimento."""
    partes = []
    if espaco := salao.get("espaco"):
        partes.append(f"""<div class="bloco"><p class="rotulo">Nosso espaço</p>
            <h2>{escape(espaco["titulo"])}</h2><p>{escape(espaco["texto"])}</p></div>""")
    if para_voce := salao.get("para_voce"):
        partes.append(f"""<div class="bloco"><p class="rotulo">Para você</p>
            <h2>{escape(para_voce["titulo"])} <em>{escape(para_voce["destaque"])}</em></h2>
            <p>{escape(para_voce["texto"])}</p></div>""")
    if sobre := salao.get("sobre"):
        partes.append(f"""<div class="bloco escuro"><p class="rotulo">{escape(salao["nome"])}</p>
            <h2>{escape(sobre["titulo"])} <em>{escape(sobre["destaque"])}</em></h2>
            <p>{escape(sobre["texto"])}</p></div>""")
    if depoimento := salao.get("depoimento"):
        partes.append(f"""<div class="bloco depoimento"><p class="estrelas" aria-label="5 estrelas">★★★★★</p>
            <blockquote>"{escape(depoimento)}"</blockquote>
            <p class="assinatura">{escape(salao["nome"])} {escape(salao.get("subtitulo", ""))}</p></div>""")
    return "".join(partes)


def servicos(salao: dict) -> str:
    """Lista completa, por grupo, para quando o cartão "Todos os Serviços" aponta para #servicos."""
    grupos = []
    for grupo, itens in servicos_por_grupo(salao).items():
        linhas = []
        for s in itens:
            extras = ""
            if s.get("duracao_min"):
                extras += f'<span class="dur">{s["duracao_min"]} min</span>'
            if s.get("preco"):
                extras += f'<span class="preco">R$ {s["preco"]}</span>'
            linhas.append(f'<li><span class="nome">{escape(s["nome"])}</span>{extras}</li>')
        grupos.append(f'<h3>{escape(grupo)}</h3><ul>{"".join(linhas)}</ul>')
    if not grupos:
        return ""
    return f'<section id="servicos" class="bloco"><p class="rotulo">Todos os serviços</p>{"".join(grupos)}</section>'


def rodape(salao: dict) -> str:
    """WhatsApp e, no lugar da linha de crédito, a linha discreta que leva ao painel da equipe."""
    horarios = "".join(f"<p>{escape(h['dias'])}: {escape(h['horas'])}</p>" for h in salao.get("horarios", []))
    return f"""
    {cartao(link_whatsapp(salao["whatsapp"]), "message-circle", "Agende pelo WhatsApp", "Resposta rápida & atendimento exclusivo")}
    <footer class="rodape">
      <div class="logo pequeno" aria-hidden="true"><span class="mono">{escape(salao.get("monograma", ""))}</span></div>
      <p class="rodape-nome">{escape(salao["nome"])} {escape(salao.get("subtitulo", ""))}</p>
      <p>{escape(salao.get("rodape", ""))}</p>
      <div class="hora">{icone("clock")}<div>{horarios or "<p>Atendimento com hora marcada</p>"}</div></div>
      <p class="miudo">© 2026 · Todos os direitos reservados</p>
      {link(salao.get("link_equipe", "painel"), "Acesso da equipe", "equipe")}
    </footer>"""


salao = carregar_salao()
itens = cartoes_da_pagina(salao)
lista = servicos(salao) if any(c["endereco"] == "#servicos" for c in itens) else ""
pagina = f"""
<div class="vitrine">
  {topo(salao)}
  {cartoes(itens)}
  {diferenciais(salao)}
  {textos(salao)}
  {lista}
  {rodape(salao)}
</div>"""

aplicar_css("inicio")
# No markdown do Streamlit, linha com recuo vira bloco de código; tudo numa linha só evita isso.
st.markdown(" ".join(linha.strip() for linha in pagina.splitlines() if linha.strip()), unsafe_allow_html=True)
