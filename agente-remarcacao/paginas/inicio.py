"""Página pública do salão: serviços, equipe, horário e o botão para agendar pelo WhatsApp.

Não mostra nada das clientes e não tem link para o painel.
"""
from html import escape

import streamlit as st

from src.dados import carregar_profissionais
from src.salao import carregar_salao, link_whatsapp

salao = carregar_salao()
equipe = list(carregar_profissionais().values())
agendar = link_whatsapp(salao["whatsapp"], salao["mensagem_whatsapp"])


def juntar(nomes: list[str]) -> str:
    """Lia, Nina e Rafa."""
    return nomes[0] if len(nomes) == 1 else f"{', '.join(nomes[:-1])} e {nomes[-1]}"


servicos = "".join(
    f'<li><span class="nome">{escape(s["nome"])}</span><span class="dur">{s["duracao_min"]} min</span>'
    f'<span class="preco">R$ {s["preco"]}</span></li>'
    for s in salao["servicos"]
)
horarios = "".join(f"<li><span>{escape(h['dias'])}</span><span>{escape(h['horas'])}</span></li>" for h in salao["horarios"])
instagram = (
    f'<p><a href="https://instagram.com/{escape(salao["instagram"])}" target="_blank" rel="noopener">'
    f'@{escape(salao["instagram"])} no Instagram</a></p>'
    if salao.get("instagram")
    else ""
)

PAGINA = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Gloock&display=swap');

/* esconde a moldura do Streamlit: aqui é a vitrine do salão */
header[data-testid="stHeader"], [data-testid="stSidebarCollapsedControl"], [data-testid="stToolbar"] {{display: none;}}
.block-container {{padding-top: 1.25rem; padding-bottom: 3rem;}}

.vitrine {{
  --vinho: #7A1E48; --vinho-escuro: #5A1435; --rosa-cha: #F3D7DE; --branco: #FFFFFF;
  max-width: 34rem; margin: 0 auto; font-family: 'Figtree', system-ui, sans-serif; line-height: 1.5;
}}
.vitrine h1, .vitrine h2 {{font-family: 'Gloock', Georgia, serif; font-weight: 400; letter-spacing: -0.01em;}}

.frasco {{
  position: relative; overflow: hidden; border-radius: 1.75rem; padding: 2.25rem 1.5rem 1.75rem;
  background: var(--vinho); color: var(--branco);
}}
/* o brilho de esmalte recém-passado */
.frasco::before {{
  content: ""; position: absolute; top: -30%; left: -15%; width: 70%; height: 90%;
  background: radial-gradient(closest-side, rgba(255,255,255,.28), rgba(255,255,255,0));
  transform: rotate(-18deg); pointer-events: none;
}}
.frasco h1 {{font-size: clamp(2.4rem, 9vw, 3.4rem); line-height: 1.02; margin: 0 0 .75rem; color: var(--branco);}}
.frasco p {{font-size: 1.1rem; margin: 0 0 1.75rem; max-width: 24rem; color: var(--rosa-cha);}}

.agendar {{
  display: block; text-align: center; text-decoration: none !important; font-weight: 700; font-size: 1.15rem;
  background: var(--branco); color: var(--vinho) !important; padding: 1rem 1.25rem; border-radius: 999px;
}}
.agendar:hover {{background: var(--rosa-cha);}}
.agendar:focus-visible {{outline: 3px solid var(--rosa-cha); outline-offset: 3px;}}
.frasco .aviso {{font-size: .9rem; margin: .75rem 0 0; color: var(--rosa-cha); opacity: .9;}}

.vitrine section {{padding: 2rem .25rem 0;}}
.vitrine h2 {{font-size: 1.6rem; margin: 0 0 .75rem;}}
.vitrine ul {{list-style: none; margin: 0; padding: 0;}}
.vitrine ul li {{margin: 0; padding-left: 0;}}  /* o Streamlit recua listas; aqui as linhas vão de ponta a ponta */
.servicos li, .horarios li {{
  display: flex; gap: .75rem; align-items: baseline; padding: .7rem 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent);  /* aparece no tema claro e no escuro */
}}
.servicos .nome {{flex: 1; font-weight: 600;}}
.servicos .dur {{opacity: .7;}}
.servicos .preco {{min-width: 4.5rem; text-align: right; font-weight: 700;}}
.horarios li span:first-child {{flex: 1;}}
.vitrine section p {{margin: .25rem 0;}}
.vitrine a {{color: inherit;}}
.rodape {{padding-top: 2.5rem; font-size: .95rem;}}
</style>

<div class="vitrine">
  <div class="frasco">
    <h1>{escape(salao["nome"])}</h1>
    <p>{escape(salao["frase"])}</p>
    <a class="agendar" href="{agendar}" target="_blank" rel="noopener">Agendar pelo WhatsApp</a>
    <p class="aviso">Abre uma conversa com a gente, já com a mensagem escrita.</p>
  </div>

  <section class="servicos">
    <h2>Serviços</h2>
    <ul>{servicos}</ul>
  </section>

  <section>
    <h2>Quem atende</h2>
    <p>{escape(juntar(equipe))}. Se você tem preferência por alguém, é só dizer na mensagem.</p>
  </section>

  <section class="horarios">
    <h2>Onde e quando</h2>
    <p>{escape(salao["endereco"])}, {escape(salao["bairro_cidade"])}</p>
    <ul>{horarios}</ul>
    {instagram}
  </section>

  <p class="rodape">Precisa remarcar? <a href="{link_whatsapp(salao["whatsapp"], "Oi! Preciso remarcar meu horário.")}" target="_blank" rel="noopener">Fale com a gente no WhatsApp</a>.</p>
</div>
"""

# No markdown, linha com recuo ou depois de linha em branco vira bloco de código; tudo numa linha só evita isso.
st.markdown(" ".join(linha.strip() for linha in PAGINA.splitlines() if linha.strip()), unsafe_allow_html=True)
