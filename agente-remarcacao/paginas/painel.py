"""Painel de remarcação: agenda, chat simulado e o porquê de cada escolha, lado a lado.

Fica em /painel, sem link na página pública, e pede senha quando APP_SENHA está configurada.
O Streamlit roda este arquivo de novo a cada clique; o andamento fica em st.session_state (src/estado.py).
"""
import copy
import html

import pandas as pd
import streamlit as st

from paginas.comum import aplicar_css, exigir_senha, menu_do_painel
from paginas.formatos import descrever_horario, nome_do_dia, quando, sem_formula
from src.cascata import MAX_PROF
from src.dados import carregar_cenarios
from src.estado import ETAPAS, Fluxo
from src.ferramentas import ErroMovimento, liberar_horario
from src.filtros import MOTIVOS
from src.historico import Historico, aplicar
from src.llm import ErroLLM
from src.metrica import horas_vagas_esperadas

RESPOSTAS_PRONTAS = {
    "Aceita": "Consigo sim, pode marcar!",
    "Recusa": "Não vou conseguir, prefiro manter meu horário.",
    "Outro horário": "Hoje não dá, mas depois das 17h eu consigo.",
}


# ---------------------------------------------------------------------------
# Estado e ações
# ---------------------------------------------------------------------------

@st.cache_data
def cenarios_por_id() -> dict:
    """Carrega os cenários uma vez só."""
    return {c.id: c for c in carregar_cenarios()}


def fluxo_atual() -> Fluxo:
    """Devolve o fluxo em andamento; cria um novo ao trocar de cenário ou ligar/desligar o histórico."""
    escolhido = st.session_state.get("cenario_id", "S1")
    com_historico = st.session_state.get("com_historico", False)
    chave = (escolhido, com_historico)
    if "fluxo" not in st.session_state or st.session_state.get("chave_fluxo") != chave:
        cenario, historico = cenarios_por_id()[escolhido], None
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
    """Roda a ação de um botão; se a IA ou a agenda externa falharem, mostra o erro sem perder o estado."""
    try:
        with st.spinner("Um instante..."):
            acao(*args)
        st.session_state.erro = None
    except (ErroLLM, ErroMovimento) as e:
        st.session_state.erro = f"{e} Nada foi alterado; tente de novo."
    st.rerun()


# ---------------------------------------------------------------------------
# Partes da tela
# ---------------------------------------------------------------------------

def desenhar_topo() -> Fluxo:
    """Título, escolha do cenário, profundidade e botão de reiniciar."""
    cenarios = cenarios_por_id()
    ids = list(cenarios)
    titulo, seletor, controle = st.columns([3, 3, 2])
    with titulo:
        st.markdown("### Remarcação")
        st.caption("WhatsApp simulado · dados fictícios")
    with seletor:
        st.selectbox(
            "Cenário",
            ids,
            key="cenario_id",
            format_func=lambda i: f"Cenário {ids.index(i) + 1} de {len(ids)}: {cenarios[i].nome}",
        )
    fluxo = fluxo_atual()
    with controle:
        st.metric("Profundidade", f"{min(fluxo.profundidade, MAX_PROF)} de {MAX_PROF}")
        if st.button("Reiniciar cenário"):
            st.session_state.pop("fluxo")
            st.rerun()
    if st.session_state.get("erro"):
        st.error(st.session_state.erro)
    return fluxo


def desenhar_fechar_o_dia(fluxo: Fluxo) -> None:
    """Painel lateral: marcar quem veio e quem faltou. Só com o histórico ligado."""
    st.sidebar.subheader("Fechar o dia")
    if not st.session_state.get("com_historico"):
        st.sidebar.caption("Ligue o histórico acima para marcar quem veio e quem faltou.")
        return

    registro = fluxo.historico
    datas = sorted({s.data for s in fluxo.cenario.agenda})
    dia = st.sidebar.selectbox("Dia", datas, format_func=nome_do_dia)
    ocupados = sorted((s for s in fluxo.cenario.agenda if s.data == dia and s.status == "ocupado"), key=lambda s: s.hora)
    for slot in ocupados:
        cliente = fluxo.cenario.clientes[slot.cliente_id]
        st.sidebar.markdown(f"**{slot.hora}** · {cliente.nome} · {fluxo.cenario.nome_profissional(slot.profissional_id)}")
        marcado = registro.presenca_marcada(slot.id)
        if marcado:
            st.sidebar.caption("Veio ✔" if marcado == "veio" else "Faltou ✘")
            continue
        veio, faltou = st.sidebar.columns(2)
        if veio.button("Veio", key=f"veio-{slot.id}", use_container_width=True):
            registro.registrar(slot.cliente_id, "veio", slot.id)
            st.rerun()
        if faltou.button("Faltou", key=f"faltou-{slot.id}", use_container_width=True):
            registro.registrar(slot.cliente_id, "faltou", slot.id)
            st.rerun()

    eventos = registro.eventos()
    st.sidebar.caption(
        f"{len(eventos)} registros em {registro.arquivo.name}. "
        "Os números novos valem a partir do próximo cenário (ou de Reiniciar)."
    )
    if eventos:
        with st.sidebar.expander("Últimos registros"):
            st.dataframe(pd.DataFrame(eventos[-10:][::-1]), hide_index=True, use_container_width=True)


def desenhar_agenda(fluxo: Fluxo) -> None:
    """Coluna 1: cada dia, antes e depois, e as horas vagas esperadas."""
    st.subheader("Agenda")
    original, atual = fluxo.original, fluxo.cenario
    for data in sorted(original.dias):
        dia = original.dias[data]
        st.markdown(f"**{nome_do_dia(data)}** · {dia.ocupacao_pct}% ocupado · fila {dia.fila_espera}")
        for antes in sorted((s for s in original.agenda if s.data == data), key=lambda s: s.hora):
            profissional = original.nome_profissional(antes.profissional_id)
            situacao = descrever_horario(antes, atual.slot(antes.id), original, atual)
            st.markdown(f"{antes.hora} · {profissional} · {situacao}")

    # comparação: deixar o horário cancelado vago contra o que o fluxo já fez
    sem_mexer = copy.deepcopy(original)
    liberar_horario(sem_mexer, original.slot_cancelado_id)
    st.divider()
    st.caption("Horas vagas esperadas (estimativa do modelo de conta)")
    antes_col, agora_col = st.columns(2)
    antes_col.metric("Sem mexer", f"{horas_vagas_esperadas(original, sem_mexer):.2f} h")
    agora_col.metric("Agora", f"{horas_vagas_esperadas(original, atual):.2f} h")


def desenhar_chat(fluxo: Fluxo) -> None:
    """Coluna 2: conversa simulada e os botões para responder como a cliente."""
    atual = fluxo.cenario
    com_cliente = [p.cliente_id for p in fluxo.passos if p.cliente_id]
    cliente_id = fluxo.cliente_atual or (com_cliente[-1] if com_cliente else None)
    st.subheader(atual.clientes[cliente_id].nome if cliente_id else "Nenhuma conversa ainda")
    st.caption("cliente fictícia · WhatsApp simulado")

    # o que a IA entendeu da última resposta de cada cliente
    entendido = {p.cliente_id: p.interpretacao for p in fluxo.passos if p.cliente_id}
    if fluxo.interpretacao and fluxo.cliente_atual:
        entendido[fluxo.cliente_atual] = fluxo.interpretacao.resultado

    caixa = st.container(height=420)
    mensagens = fluxo.canal.historico
    for i, m in enumerate(mensagens):
        quem = "FlowAgenda" if m.de == "agente" else atual.clientes[m.cliente_id].nome
        caixa.markdown(
            f'<div class="bolha {m.de}"><div class="quem">{html.escape(quem)}</div>{html.escape(m.texto)}</div>',
            unsafe_allow_html=True,
        )
        ultima_da_cliente = m.de == "cliente" and not any(
            n.cliente_id == m.cliente_id and n.de == "cliente" for n in mensagens[i + 1 :]
        )
        if ultima_da_cliente and entendido.get(m.cliente_id):
            caixa.markdown(f'<span class="etiqueta">A IA entendeu: {entendido[m.cliente_id]}</span>', unsafe_allow_html=True)

    esperando = fluxo.estado == "aguardando_resposta"
    for coluna, (rotulo, texto) in zip(st.columns(len(RESPOSTAS_PRONTAS)), RESPOSTAS_PRONTAS.items(), strict=True):
        if coluna.button(rotulo, disabled=not esperando, use_container_width=True):
            agir(fluxo.responder, texto)
    if st.button("Não respondeu, tentar outra", disabled=not esperando, use_container_width=True):
        agir(fluxo.sem_resposta)
    with st.form("resposta_livre", clear_on_submit=True):
        livre = st.text_input("Responder como a cliente", disabled=not esperando)
        if st.form_submit_button("Enviar", disabled=not esperando) and livre.strip():
            agir(fluxo.responder, livre.strip())


def desenhar_decisao(fluxo: Fluxo) -> None:
    """Coluna 3: o horário vago, as candidatas com os números, o porquê da escolha e a aprovação."""
    atual = fluxo.cenario
    st.subheader("Por que essa cliente")
    vago = atual.slot(fluxo.slot_atual)
    titulo = "Cancelamento" if fluxo.profundidade == 0 else f"Novo horário vago (nível {fluxo.profundidade})"
    detalhe = f" · {fluxo.quem_cancelou} cancelou" if fluxo.profundidade == 0 else ""
    st.markdown(
        f"**{titulo}:** {quando(vago)} com {atual.nome_profissional(vago.profissional_id)} · "
        f"{vago.duracao_min} min · {atual.antecedencia_h(vago):.0f}h de aviso{detalhe}"
    )

    tabela = tabela_de_candidatas(fluxo)
    if tabela:
        st.dataframe(pd.DataFrame(tabela), hide_index=True, use_container_width=True)
        st.caption("Números calculados pelo código.")

    if fluxo.decisao:
        st.info(sem_formula(fluxo.decisao.justificativa))
        st.caption("Escolha feita pelo código. A IA só entra para entender a resposta da cliente.")

    st.markdown("**Etapas**")
    etapas = [
        f'<span class="etapa-atual">{e}</span>' if i == fluxo.etapa and not fluxo.terminou else e
        for i, e in enumerate(ETAPAS)
    ]
    st.markdown(" → ".join(etapas), unsafe_allow_html=True)

    if fluxo.terminou:
        texto = "Rejeitado na aprovação. A agenda não mudou." if fluxo.estado == "rejeitado" else fluxo.passos[-1].justificativa
        st.warning(f"Fim: {sem_formula(texto)}")
    elif fluxo.estado == "candidatos_calculados":
        if st.button("Escolher e enviar proposta", type="primary", use_container_width=True):
            agir(fluxo.pedir_decisao)

    aprovando = fluxo.estado == "aguardando_aprovacao"
    aprovar, rejeitar = st.columns(2)
    if aprovar.button("Aprovar e atualizar agenda", type="primary", disabled=not aprovando, use_container_width=True):
        agir(fluxo.aprovar)
    if rejeitar.button("Rejeitar", disabled=not aprovando, use_container_width=True):
        agir(fluxo.rejeitar)
    st.caption("Ao aprovar, o horário que a cliente deixou volta ao início do fluxo (cascata).")

    if fluxo.passos:
        with st.expander("Histórico desta cascata"):
            for p in fluxo.passos:
                quem = atual.clientes[p.cliente_id].nome if p.cliente_id else "-"
                st.markdown(f"Nível {p.profundidade} · {quando(atual.slot(p.slot_id))} · {quem} · **{p.resultado}**")


def tabela_de_candidatas(fluxo: Fluxo) -> list[dict]:
    """Uma linha por candidata, sem quem já está marcada antes do horário vago."""
    atual = fluxo.cenario
    escolhida = fluxo.decisao.cliente_id if fluxo.decisao else None
    linhas = []
    for c in fluxo.candidatos:
        if c.motivo == "nao_posterior":
            continue
        cliente = atual.clientes[c.cliente_id]
        if c.cliente_id == escolhida:
            resultado = "Escolhida"
        elif c.elegivel:
            resultado = "Elegível"
        else:
            resultado = MOTIVOS[c.motivo]
        linhas.append({
            "Cliente": c.nome,
            "Falta": f"{c.taxa_falta:.0%}" if c.taxa_falta is not None else "-",
            "Prefere": atual.nome_profissional(cliente.profissional_preferida),
            "Disposição": f"{cliente.disposicao}/10" + (" (marcou tarde)" if c.escolheu_tarde else ""),
            "Aceita": f"{c.prob_aceitar:.0%}" if c.prob_aceitar is not None else "-",
            "Valor esperado": f"R$ {c.valor_esperado:.2f}" if c.valor_esperado is not None else "-",
            "Resultado": resultado,
        })
    return linhas


# ---------------------------------------------------------------------------
# Página
# ---------------------------------------------------------------------------

aplicar_css("painel")
exigir_senha()
menu_do_painel()
st.sidebar.toggle(
    "Usar e registrar histórico",
    key="com_historico",
    help="Desligado, nada é gravado (bom para demonstrar). Ligado, as propostas e as presenças vão para "
    "registro/historico.csv e entram nos números das clientes.",
)

fluxo = desenhar_topo()
desenhar_fechar_o_dia(fluxo)
coluna_agenda, coluna_chat, coluna_decisao = st.columns([300, 420, 488], gap="medium")
with coluna_agenda:
    desenhar_agenda(fluxo)
with coluna_chat:
    desenhar_chat(fluxo)
with coluna_decisao:
    desenhar_decisao(fluxo)
