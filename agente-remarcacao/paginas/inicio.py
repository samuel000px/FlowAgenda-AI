"""Página pública do salão, no estilo "link na bio": cartões que levam ao WhatsApp, mapa e Instagram.

Não mostra nada das clientes. O único caminho para o painel é a linha discreta "Acesso da equipe"
no rodapé, e o painel pede senha. O conteúdo vem de data/salao.json (ou salao.local.json); cada
seção só aparece se tiver conteúdo. O visual está em paginas/estilos/inicio.css.
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


def link(endereco: str, conteudo: str, classe: str = "", nova_aba: bool = True) -> str:
    """Um <a>; por padrão abre em outra aba (WhatsApp, mapa, Instagram)."""
    alvo = 'target="_blank" rel="noopener"' if nova_aba else 'target="_self"'
    return f'<a class="{classe}" href="{endereco}" {alvo}>{conteudo}</a>'


def cartao(endereco: str, icone: str, titulo: str, subtitulo: str, nova_aba: bool = True) -> str:
    """Cartão clicável: ícone redondo, título, subtítulo e seta."""
    miolo = (
        f'<span class="icone">{icone}</span>'
        f'<span class="textos"><strong>{escape(titulo)}</strong><small>{escape(subtitulo)}</small></span>'
        '<span class="seta">→</span>'
    )
    return link(endereco, miolo, "cartao", nova_aba)


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


def cartoes(salao: dict) -> str:
    """Agendar, um cartão por serviço em destaque e os atalhos (galeria, mapa, Instagram, lista)."""
    whats = salao["whatsapp"]
    itens = [cartao(link_whatsapp(whats, salao["mensagem_whatsapp"]), "📅", "Agendar Horário", "Reserve seu momento especial")]
    for c in salao.get("cartoes", []):
        pedido = f"Oi! Vim pelo site e quero agendar: {c['titulo']}."
        itens.append(cartao(link_whatsapp(whats, pedido), c["icone"], c["titulo"], c["subtitulo"]))
    if salao.get("instagram"):
        perfil = f"https://instagram.com/{salao['instagram']}"
        itens.append(cartao(perfil, "🖼️", "Galeria de Trabalhos", "Nossas criações no Instagram"))
    itens.append(cartao(link_mapa(salao), "📍", "Localização", "Como chegar"))
    if salao.get("instagram"):
        itens.append(cartao(perfil, "📸", "Instagram", f"@{salao['instagram']}"))
    itens.append(cartao("#servicos", "📋", "Todos os Serviços", "Veja nossa lista completa", nova_aba=False))
    return f'<nav class="cartoes">{"".join(itens)}</nav>'


def diferenciais(salao: dict) -> str:
    """Grade de dois em dois."""
    itens = salao.get("diferenciais", [])
    if not itens:
        return ""
    blocos = "".join(f'<div class="caixa"><span>{d["icone"]}</span><p>{escape(d["texto"])}</p></div>' for d in itens)
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
    """Lista completa, por grupo. É para onde o cartão "Todos os Serviços" leva."""
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
    """WhatsApp, endereço e, no lugar do crédito, a linha discreta que leva ao painel."""
    agendar = link_whatsapp(salao["whatsapp"], salao["mensagem_whatsapp"])
    horarios = "".join(f"<p>{escape(h['dias'])}: {escape(h['horas'])}</p>" for h in salao.get("horarios", []))
    return f"""
    {cartao(agendar, "💬", "Agende pelo WhatsApp", f"{telefone_formatado(salao['whatsapp'])} · resposta rápida")}
    <footer class="rodape">
      <div class="logo pequeno" aria-hidden="true"><span class="mono">{escape(salao.get("monograma", ""))}</span></div>
      <p class="rodape-nome">{escape(salao["nome"])} {escape(salao.get("subtitulo", ""))}</p>
      <p>{escape(salao.get("rodape", ""))}</p>
      <p>{escape(salao["endereco"])}, {escape(salao["bairro_cidade"])}</p>
      {horarios or "<p>🕐 Atendimento com hora marcada</p>"}
      <p class="miudo">© 2026 · Todos os direitos reservados</p>
      {link("painel", "Acesso da equipe", "equipe", nova_aba=False)}
    </footer>"""


salao = carregar_salao()
pagina = f"""
<div class="vitrine">
  {topo(salao)}
  {cartoes(salao)}
  {diferenciais(salao)}
  {textos(salao)}
  {servicos(salao)}
  {rodape(salao)}
</div>"""

aplicar_css("inicio")
# No markdown do Streamlit, linha com recuo vira bloco de código; tudo numa linha só evita isso.
st.markdown(" ".join(linha.strip() for linha in pagina.splitlines() if linha.strip()), unsafe_allow_html=True)
