"""Página pública do salão: serviços, endereço e o botão para agendar pelo WhatsApp.

Não mostra nada das clientes e não tem link para o painel. O visual segue a identidade da Santa Cor:
fundo perolado, nome em caixa alta com serifa clássica, monograma manuscrito e dourado rosé.
"""
from html import escape

import streamlit as st

from src.salao import carregar_salao, link_mapa, link_whatsapp, servicos_por_grupo, telefone_formatado

salao = carregar_salao()
agendar = link_whatsapp(salao["whatsapp"], salao["mensagem_whatsapp"])


def item(s: dict) -> str:
    """Um serviço; duração e preço só aparecem se estiverem no cadastro."""
    extra = "".join(
        f'<span class="{classe}">{valor}</span>'
        for classe, valor in (("dur", f"{s['duracao_min']} min" if s.get("duracao_min") else ""),
                              ("preco", f"R$ {s['preco']}" if s.get("preco") else ""))
        if valor
    )
    return f'<li><span class="nome">{escape(s["nome"])}</span>{extra}</li>'


def juntar(nomes: list[str]) -> str:
    """Lia, Nina e Rafa."""
    return nomes[0] if len(nomes) == 1 else f"{', '.join(nomes[:-1])} e {nomes[-1]}"


grupos = "".join(
    f'<section class="servicos"><h2>{escape(grupo)}</h2><ul>{"".join(item(s) for s in itens)}</ul></section>'
    for grupo, itens in servicos_por_grupo(salao).items()
)
if salao.get("horarios"):
    horarios = "<ul class=\"horarios\">" + "".join(
        f"<li><span>{escape(h['dias'])}</span><span>{escape(h['horas'])}</span></li>" for h in salao["horarios"]
    ) + "</ul>"
else:
    horarios = f'<p>Combine o melhor horário <a href="{agendar}" target="_blank" rel="noopener">pelo WhatsApp</a>.</p>'
equipe = (
    f"<section><h2>Quem atende</h2><p>{escape(juntar(salao['equipe']))}. "
    "Se você tem preferência por alguém, é só dizer na mensagem.</p></section>"
    if salao.get("equipe")
    else ""
)
instagram = (
    f'<p><a href="https://instagram.com/{escape(salao["instagram"])}" target="_blank" rel="noopener">'
    f'@{escape(salao["instagram"])}</a> no Instagram</p>'
    if salao.get("instagram")
    else ""
)

PAGINA = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Cormorant+Garamond:wght@400;500;600&family=Pinyon+Script&display=swap');

/* esconde a moldura do Streamlit: aqui é a vitrine do salão */
header[data-testid="stHeader"], [data-testid="stSidebarCollapsedControl"], [data-testid="stToolbar"] {{display: none;}}
.block-container {{padding-top: 1rem; padding-bottom: 3rem;}}

.vitrine {{
  --perola: #F6ECE8; --perola-funda: #E9D6CD; --cacau: #3E302B; --dourado: #B98B6B; --dourado-claro: #DDBFA8;
  max-width: 34rem; margin: 0 auto;
  font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.2rem; line-height: 1.55;
}}
.vitrine h1, .vitrine h2 {{font-family: 'Cinzel', Georgia, serif; font-weight: 400;}}

/* o cartão perolado, como o flyer: fica igual no tema claro e no escuro */
.cartao {{
  position: relative; overflow: hidden; text-align: center; color: var(--cacau);
  padding: 2rem 1.5rem 2.25rem; border-radius: 1.25rem;
  background:
    radial-gradient(60% 45% at 20% 10%, rgba(255,255,255,.85), rgba(255,255,255,0)),
    radial-gradient(70% 55% at 85% 95%, rgba(221,191,168,.55), rgba(221,191,168,0)),
    linear-gradient(160deg, var(--perola), var(--perola-funda));
  box-shadow: inset 0 0 0 1px rgba(185,139,107,.35);
}}
.monograma {{font-family: 'Pinyon Script', cursive; font-size: 3.2rem; line-height: 1; color: var(--dourado); margin-bottom: .25rem;}}
.cartao h1 {{font-size: clamp(2.3rem, 10vw, 3.1rem); line-height: 1.05; letter-spacing: .04em; margin: 0; color: var(--cacau);}}
.subtitulo {{font-family: 'Cinzel', Georgia, serif; font-size: .95rem; letter-spacing: .45em; margin: .35rem 0 0 .45em;}}
.ornamento {{display: flex; align-items: center; gap: .6rem; margin: 1.25rem auto; max-width: 14rem; color: var(--dourado);}}
.ornamento::before, .ornamento::after {{content: ""; flex: 1; height: 1px; background: var(--dourado-claro);}}
.cartao .frase {{margin: 0 auto 1.5rem; max-width: 22rem; font-size: 1.25rem;}}

.agendar {{
  display: block; text-decoration: none !important; font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 600; font-size: 1.3rem; letter-spacing: .02em;
  background: var(--cacau); color: var(--perola) !important; padding: .9rem 1.25rem; border-radius: 999px;
}}
.agendar:hover {{background: #2D221E;}}
.agendar:focus-visible {{outline: 2px solid var(--dourado); outline-offset: 3px;}}
.telefone {{font-size: 1.6rem; margin: .9rem 0 0; letter-spacing: .02em;}}
.telefone a {{color: var(--cacau) !important; text-decoration: none;}}

.vitrine section {{padding: 2rem .25rem 0;}}
.vitrine h2 {{font-size: 1.45rem; letter-spacing: .06em; margin: 0 0 .5rem;}}
.vitrine ul {{list-style: none; margin: 0; padding: 0;}}
.vitrine ul li {{margin: 0; padding-left: 0;}}  /* o Streamlit recua listas; aqui as linhas vão de ponta a ponta */
.servicos li {{display: flex; gap: .75rem; align-items: baseline; padding: .3rem 0;}}
.servicos li::before {{content: "✦"; color: var(--dourado); font-size: .8rem;}}
.servicos .nome {{flex: 1;}}
.servicos .dur {{opacity: .7;}}
.servicos .preco {{font-weight: 600;}}
.horarios li {{display: flex; padding: .35rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);}}
.horarios li span:first-child {{flex: 1;}}
.vitrine section p {{margin: .2rem 0;}}
.vitrine a {{color: inherit; text-decoration-color: var(--dourado); text-underline-offset: 3px;}}
.rodape {{padding-top: 2.25rem; font-size: 1.1rem;}}
@media (prefers-reduced-motion: no-preference) {{ .agendar {{transition: background-color .15s;}} }}
</style>

<div class="vitrine">
  <div class="cartao">
    <div class="monograma" aria-hidden="true">{escape(salao.get("monograma", ""))}</div>
    <h1>{escape(salao["nome"])}</h1>
    <div class="subtitulo">{escape(salao.get("subtitulo", ""))}</div>
    <div class="ornamento" aria-hidden="true">✦</div>
    <p class="frase">{escape(salao["frase"])}</p>
    <a class="agendar" href="{agendar}" target="_blank" rel="noopener">Agendar pelo WhatsApp</a>
    <p class="telefone"><a href="{agendar}" target="_blank" rel="noopener">{telefone_formatado(salao["whatsapp"])}</a></p>
  </div>

  {grupos}
  {equipe}

  <section>
    <h2>Onde fica</h2>
    <p>{escape(salao["endereco"])}<br>{escape(salao["bairro_cidade"])}</p>
    <p><a href="{link_mapa(salao)}" target="_blank" rel="noopener">Ver no mapa</a></p>
    {horarios}
    {instagram}
  </section>

  <p class="rodape">Precisa remarcar? <a href="{link_whatsapp(salao["whatsapp"], "Oi! Preciso remarcar meu horário.")}" target="_blank" rel="noopener">Fale com a gente no WhatsApp</a>.</p>
</div>
"""

# No markdown, linha com recuo ou depois de linha em branco vira bloco de código; tudo numa linha só evita isso.
st.markdown(" ".join(linha.strip() for linha in PAGINA.splitlines() if linha.strip()), unsafe_allow_html=True)
