"""Interface: agenda, chat simulado e raciocínio do agente lado a lado.

Rodar com:  streamlit run app.py
"""
import copy
import html

import pandas as pd
import streamlit as st

from src.cascata import MAX_PROF
from src.dados import carregar_cenarios
from src.estado import ETAPAS, Fluxo
from src.ferramentas import ErroMovimento, liberar_horario
from src.filtros import MOTIVOS
from src.historico import Historico, aplicar
from src.llm import ErroLLM
from src.metrica import horas_vagas_esperadas

DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
RESPOSTAS_PRONTAS = {
    "Aceita": "Consigo sim, pode marcar!",
    "Recusa": "Não vou conseguir, prefiro manter meu horário.",
    "Outro horário": "Hoje não dá, mas depois das 17h eu consigo.",
}

st.set_page_config(page_title="Agente de remarcação", layout="wide")
st.markdown(
    """
    <style>
    .bolha {padding: .5rem .75rem; border-radius: .75rem; margin: .25rem 0; max-width: 85%; line-height: 1.35;}
    .agente {background: #1f6feb; color: #fff; margin-left: auto;}
    .cliente {background: #eaeef2; color: #1f2328;}
    .quem {font-size: .75rem; opacity: .8; margin-bottom: .1rem;}
    .etiqueta {display: inline-block; font-size: .75rem; padding: .1rem .5rem; border-radius: 1rem;
               background: #fff8c5; color: #4d2d00; border: 1px solid #d4a72c;}
    .etapa-atual {font-weight: 700; color: #1f6feb;}
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data
def cenarios_por_id() -> dict:
    """Carrega os cenários uma vez só."""
    return {c.id: c for c in carregar_cenarios()}


def fluxo_atual() -> Fluxo:
    """O fluxo fica em st.session_state para sobreviver às reexecuções do script."""
    cenarios = cenarios_por_id()
    escolhido = st.session_state.get("cenario_id", "S1")
    com_historico = st.session_state.get("com_historico", False)
    chave = (escolhido, com_historico)
    if "fluxo" not in st.session_state or st.session_state.get("chave_fluxo") != chave:
        cenario, historico = cenarios[escolhido], None
        if com_historico:
            # números da cliente = cadastro + o que já foi registrado
            historico = Historico()
            cenario = copy.copy(cenario)
            cenario.clientes = aplicar(cenario.clientes, historico.eventos())
        st.session_state.fluxo = Fluxo(cenario, historico=historico)
        st.session_state.chave_fluxo = chave
        st.session_state.erro = None
    return st.session_state.fluxo


def agir(acao, *args) -> None:
    """Roda a ação de um botão; se o modelo falhar, mostra o erro sem perder o estado."""
    try:
        with st.spinner("O agente está pensando..."):
            acao(*args)
        st.session_state.erro = None
    except (ErroLLM, ErroMovimento) as e:
        st.session_state.erro = f"{e} Nada foi alterado; tente de novo."


def sem_formula(texto: str) -> str:
    """No markdown do Streamlit, dois "$" viram fórmula; "R$ 10 ... R$ 20" quebrava o texto."""
    return texto.replace("$", r"\$")


def quando(slot) -> str:
    """Ex.: qua 28/10 13:00."""
    return f"{DIAS[slot.inicio.weekday()]} {slot.inicio:%d/%m %H:%M}"


# ---------- painel lateral: histórico ----------
st.sidebar.toggle(
    "Usar e registrar histórico",
    key="com_historico",
    help="Desligado, nada é gravado (bom para demonstrar). Ligado, as propostas e as presenças vão para "
    "registro/historico.csv e entram nos números das clientes.",
)

# ---------- barra superior ----------
cenarios = cenarios_por_id()
ids = list(cenarios)
topo = st.columns([3, 3, 2])
with topo[0]:
    st.markdown("### Agente de remarcação")
    st.caption("Canal simulado · dados fictícios")
with topo[1]:
    st.selectbox(
        "Cenário",
        ids,
        key="cenario_id",
        format_func=lambda i: f"Cenário {ids.index(i) + 1} de {len(ids)}: {cenarios[i].nome}",
    )
fluxo = fluxo_atual()
with topo[2]:
    st.metric("Profundidade", f"{min(fluxo.profundidade, MAX_PROF)} de {MAX_PROF}")
    if st.button("Reiniciar cenário"):
        st.session_state.pop("fluxo")
        st.rerun()

if st.session_state.get("erro"):
    st.error(st.session_state.erro)

with st.sidebar:
    st.subheader("Fechar o dia")
    if not st.session_state.get("com_historico"):
        st.caption("Ligue o histórico acima para marcar quem veio e quem faltou.")
    else:
        registro = fluxo.historico
        datas = sorted({s.data for s in fluxo.cenario.agenda})
        dia = st.selectbox("Dia", datas, format_func=lambda d: f"{d[8:]}/{d[5:7]}")
        for slot in sorted((s for s in fluxo.cenario.agenda if s.data == dia and s.status == "ocupado"), key=lambda s: s.hora):
            cliente = fluxo.cenario.clientes[slot.cliente_id]
            marcado = registro.presenca_marcada(slot.id)
            st.markdown(f"**{slot.hora}** · {cliente.nome} · {fluxo.cenario.nome_profissional(slot.profissional_id)}")
            if marcado:
                st.caption("Veio ✔" if marcado == "veio" else "Faltou ✘")
                continue
            veio, faltou = st.columns(2)
            if veio.button("Veio", key=f"veio-{slot.id}", use_container_width=True):
                registro.registrar(slot.cliente_id, "veio", slot.id)
                st.rerun()
            if faltou.button("Faltou", key=f"faltou-{slot.id}", use_container_width=True):
                registro.registrar(slot.cliente_id, "faltou", slot.id)
                st.rerun()
        eventos = registro.eventos()
        st.caption(f"{len(eventos)} registros em {registro.arquivo.relative_to(registro.arquivo.parents[1])}. "
                   "Os números novos valem a partir do próximo cenário (ou de Reiniciar).")
        if eventos:
            with st.expander("Últimos registros"):
                st.dataframe(pd.DataFrame(eventos[-10:][::-1]), hide_index=True, use_container_width=True)

col_agenda, col_chat, col_razao = st.columns([300, 420, 488], gap="medium")

# ---------- coluna 1: agenda ----------
with col_agenda:
    st.subheader("Agenda")
    original, atual = fluxo.original, fluxo.cenario
    for data in sorted(original.dias):
        dia = original.dias[data]
        slots = sorted((s for s in original.agenda if s.data == data), key=lambda s: s.hora)
        st.markdown(f"**{quando(slots[0])[:9]}** · {dia.ocupacao_pct}% ocupado · fila {dia.fila_espera}")
        for antes in slots:
            depois = atual.slot(antes.id)
            nome_antes = original.clientes[antes.cliente_id].nome
            prof = original.nome_profissional(antes.profissional_id)
            if depois.cliente_id == antes.cliente_id:
                st.markdown(f"{antes.hora} · {prof} · {nome_antes}")
                continue
            if antes.id == original.slot_cancelado_id:
                origem = f"~~{nome_antes}~~ cancelou"
            else:
                origem = f"~~{nome_antes}~~ antecipada"
            if depois.status == "ocupado":
                destino = f"**{atual.clientes[depois.cliente_id].nome}** (antecipada)"
            else:
                aviso = atual.antecedencia_h(depois)
                destino = f":orange[**horário vago**] · {aviso:.0f}h de aviso · fila {atual.dias[data].fila_espera}"
            st.markdown(f"{antes.hora} · {prof} · {origem} → {destino}")

    sem_mexer = copy.deepcopy(original)
    liberar_horario(sem_mexer, original.slot_cancelado_id)
    st.divider()
    st.caption("Horas vagas esperadas (estimativa do modelo de score)")
    c1, c2 = st.columns(2)
    c1.metric("Sem mexer", f"{horas_vagas_esperadas(original, sem_mexer):.2f} h")
    c2.metric("Agora", f"{horas_vagas_esperadas(original, atual):.2f} h")

# ---------- coluna 2: chat simulado ----------
with col_chat:
    com_cliente = [p.cliente_id for p in fluxo.passos if p.cliente_id]
    cliente_id = fluxo.cliente_atual or (com_cliente[-1] if com_cliente else None)
    nome = atual.clientes[cliente_id].nome if cliente_id else "Nenhuma conversa ainda"
    st.subheader(nome)
    st.caption("cliente fictícia · canal simulado")

    interpretacoes = {p.cliente_id: p.interpretacao for p in fluxo.passos if p.cliente_id}
    if fluxo.interpretacao and fluxo.cliente_atual:
        interpretacoes[fluxo.cliente_atual] = fluxo.interpretacao.resultado
    caixa = st.container(height=420)
    historico = fluxo.canal.historico
    for i, m in enumerate(historico):
        quem = "Agente" if m.de == "agente" else atual.clientes[m.cliente_id].nome
        caixa.markdown(
            f'<div class="bolha {m.de}"><div class="quem">{html.escape(quem)}</div>{html.escape(m.texto)}</div>',
            unsafe_allow_html=True,
        )
        ultima_da_cliente = m.de == "cliente" and not any(
            n.cliente_id == m.cliente_id and n.de == "cliente" for n in historico[i + 1 :]
        )
        if ultima_da_cliente and interpretacoes.get(m.cliente_id):
            caixa.markdown(
                f'<span class="etiqueta">Interpretação do agente: {interpretacoes[m.cliente_id]}</span>',
                unsafe_allow_html=True,
            )

    esperando = fluxo.estado == "aguardando_resposta"
    botoes = st.columns(len(RESPOSTAS_PRONTAS))
    for coluna, (rotulo, texto) in zip(botoes, RESPOSTAS_PRONTAS.items()):
        if coluna.button(rotulo, disabled=not esperando, use_container_width=True):
            agir(fluxo.responder, texto)
            st.rerun()
    if st.button("Não respondeu, tentar outra", disabled=not esperando, use_container_width=True):
        agir(fluxo.sem_resposta)
        st.rerun()
    with st.form("resposta_livre", clear_on_submit=True):
        livre = st.text_input("Responder como a cliente", disabled=not esperando)
        if st.form_submit_button("Enviar", disabled=not esperando) and livre.strip():
            agir(fluxo.responder, livre.strip())
            st.rerun()

# ---------- coluna 3: raciocínio do agente ----------
with col_razao:
    st.subheader("Raciocínio do agente")
    vago = atual.slot(fluxo.slot_atual)
    titulo = "Cancelamento" if fluxo.profundidade == 0 else f"Novo horário vago (nível {fluxo.profundidade})"
    st.markdown(
        f"**{titulo}:** {quando(vago)} com {atual.nome_profissional(vago.profissional_id)} · {vago.duracao_min} min · "
        f"{atual.antecedencia_h(vago):.0f}h de aviso"
        + (f" · {fluxo.quem_cancelou} cancelou" if fluxo.profundidade == 0 else "")
    )

    if fluxo.candidatos:
        escolhida = fluxo.decisao.cliente_id if fluxo.decisao else None
        linhas = []
        for c in fluxo.candidatos:
            if c.motivo == "nao_posterior":
                continue
            resultado = "Escolhida" if c.cliente_id == escolhida else "Elegível" if c.elegivel else MOTIVOS[c.motivo]
            linhas.append({
                "Cliente": c.nome,
                "Falta": f"{c.taxa_falta:.0%}" if c.taxa_falta is not None else "-",
                "Prefere": atual.nome_profissional(atual.clientes[c.cliente_id].profissional_preferida),
                "Disposição": f"{atual.clientes[c.cliente_id].disposicao}/10",
                "Aceita": f"{c.prob_aceitar:.0%}" if c.prob_aceitar is not None else "-",
                "Valor esperado": f"R$ {c.valor_esperado:.2f}" if c.valor_esperado is not None else "-",
                "Resultado": resultado,
            })
        st.dataframe(pd.DataFrame(linhas), hide_index=True, use_container_width=True)
        st.caption("Números calculados pelo código.")

    if fluxo.decisao:
        st.markdown("**Decisão do agente**")
        st.info(sem_formula(fluxo.decisao.justificativa))
        st.caption("Gerada pelo modelo.")

    st.markdown("**Etapas**")
    st.markdown(
        " → ".join(
            f'<span class="etapa-atual">{e}</span>' if i == fluxo.etapa and not fluxo.terminou else e
            for i, e in enumerate(ETAPAS)
        ),
        unsafe_allow_html=True,
    )

    if fluxo.terminou:
        fim = fluxo.passos[-1]
        texto = "Rejeitado na aprovação. A agenda não mudou." if fluxo.estado == "rejeitado" else fim.justificativa
        st.warning(f"Fim: {sem_formula(texto)}")
    elif fluxo.estado == "candidatos_calculados":
        if st.button("Pedir decisão ao agente", type="primary", use_container_width=True):
            agir(fluxo.pedir_decisao)
            st.rerun()

    aprovando = fluxo.estado == "aguardando_aprovacao"
    a, r = st.columns(2)
    if a.button("Aprovar e atualizar agenda", type="primary", disabled=not aprovando, use_container_width=True):
        agir(fluxo.aprovar)
        st.rerun()
    if r.button("Rejeitar", disabled=not aprovando, use_container_width=True):
        agir(fluxo.rejeitar)
        st.rerun()
    st.caption("Ao aprovar, o horário que a cliente deixou volta ao início do fluxo (cascata).")

    if fluxo.passos:
        with st.expander("Histórico desta cascata"):
            for p in fluxo.passos:
                quem = atual.clientes[p.cliente_id].nome if p.cliente_id else "-"
                st.markdown(f"Nível {p.profundidade} · {quando(atual.slot(p.slot_id))} · {quem} · **{p.resultado}**")
