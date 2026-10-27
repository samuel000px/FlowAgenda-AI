"""Cascata: trata um cancelamento e, se alguém for movida, trata o horário que ela deixou.

Quem controla a profundidade e a poda é este código, nunca o modelo.
"""
from collections.abc import Callable
from dataclasses import dataclass, field

from src.agenda_externa import AgendaExterna, SemAgendaExterna
from src.canal import Canal
from src.ferramentas import aplicar_movimento_aprovado, buscar_candidatos
from src.interpretacao import Interpretacao
from src.modelos import Candidato, Cenario, Decisao, Slot

MAX_PROF = 2


@dataclass
class Passo:
    """O que aconteceu em uma tentativa de ocupar um horário."""

    profundidade: int
    slot_id: str
    resultado: str  # "aceitou", "recusou", "rejeitado", "nao_agir" ou "limite"
    cliente_id: str | None = None
    justificativa: str = ""
    mensagem: str | None = None
    resposta: str | None = None
    interpretacao: str | None = None  # o que o modelo entendeu (pode ser "outro_horario")
    novo_buraco_id: str | None = None


@dataclass
class Atores:
    """Quem participa do fluxo. Nos testes, um substituto sem LLM entra no lugar do agente."""

    decidir: Callable[[Cenario, str, frozenset, int], Decisao]
    interpretar: Callable[[str, str], Interpretacao]
    canal: Canal
    aprovar: Callable[[Cenario, Decisao, str], bool]  # a pessoa que aprova a mudança
    avisar: Callable[[str, dict], None] = field(default=lambda evento, dados: None)  # para mostrar na tela
    agenda_externa: AgendaExterna = field(default_factory=SemAgendaExterna)  # ex.: Google Agenda


def tratar_cancelamento(
    cenario: Cenario,
    slot_id: str,
    atores: Atores,
    profundidade: int = 0,
    recusados: frozenset = frozenset(),
    passos: list[Passo] | None = None,
) -> list[Passo]:
    """Tenta ocupar o horário vago; se der certo, chama a si mesma para o horário que ficou vago."""
    passos = [] if passos is None else passos

    if profundidade > MAX_PROF:
        return _encerrar(passos, atores, Passo(profundidade, slot_id, "limite", justificativa=TEXTO_LIMITE))

    # 1 a 4: filtros, score e poda, tudo no código
    candidatos = buscar_candidatos(cenario, slot_id, recusados)
    atores.avisar("candidatos", {"profundidade": profundidade, "slot_id": slot_id, "candidatos": candidatos})
    if not any(c.elegivel for c in candidatos):
        return _encerrar(passos, atores, Passo(profundidade, slot_id, "nao_agir", justificativa=sem_candidatas(candidatos)))

    # 5: o modelo escolhe entre as que sobraram e escreve a mensagem
    decisao = atores.decidir(cenario, slot_id, recusados, profundidade)
    atores.avisar("decisao", {"profundidade": profundidade, "slot_id": slot_id, "decisao": decisao})
    if decisao.cliente_id is None:
        return _encerrar(passos, atores, Passo(profundidade, slot_id, "nao_agir", justificativa=decisao.justificativa))

    # 6 e 7: mensagem pelo canal e leitura da resposta
    resposta, interp = conversar(cenario, slot_id, decisao, atores)
    passo = Passo(
        profundidade, slot_id, "recusou", decisao.cliente_id, decisao.justificativa,
        decisao.mensagem, resposta, interp.resultado,
    )
    if interp.resultado != "aceitou":
        # recusou ou pediu outro horário: plano B, mesma vaga, sem quem recusou
        passos.append(passo)
        return tratar_cancelamento(cenario, slot_id, atores, profundidade, recusados | {decisao.cliente_id}, passos)

    # 8: aprovação humana; só então a agenda muda
    if not atores.aprovar(cenario, decisao, slot_id):
        passo.resultado = "rejeitado"
        return _encerrar(passos, atores, passo)
    novo_buraco = aplicar_movimento_aprovado(cenario, decisao.cliente_id, slot_id, atores.agenda_externa)
    passo.resultado, passo.novo_buraco_id = "aceitou", novo_buraco.id
    passos.append(passo)
    atores.avisar("movimento", {"passo": passo, "novo_buraco": novo_buraco})

    # 9: o horário que ela deixou vira um novo cancelamento
    return tratar_cancelamento(cenario, novo_buraco.id, atores, profundidade + 1, recusados, passos)


def conversar(cenario: Cenario, slot_id: str, decisao: Decisao, atores: Atores) -> tuple[str, Interpretacao]:
    """Envia a proposta, lê a resposta e, se ficar ambígua, pergunta uma vez só."""
    canal, cliente_id = atores.canal, decisao.cliente_id
    canal.enviar(cliente_id, decisao.mensagem)
    resposta = canal.receber(cliente_id) or ""
    interp = atores.interpretar(decisao.mensagem, resposta)
    atores.avisar("interpretacao", {"cliente_id": cliente_id, "resposta": resposta, "interpretacao": interp})
    if interp.resultado == "ambiguo":
        pergunta = pergunta_de_esclarecimento(cenario.slot(slot_id))
        canal.enviar(cliente_id, pergunta)
        resposta = canal.receber(cliente_id) or ""
        interp = atores.interpretar(pergunta, resposta)
        if interp.resultado == "ambiguo":
            interp.resultado = "recusou"  # continuou sem dar para entender: não insistimos
        atores.avisar("interpretacao", {"cliente_id": cliente_id, "resposta": resposta, "interpretacao": interp})
    return resposta, interp


def pergunta_de_esclarecimento(slot: Slot) -> str:
    """Texto fixo, escrito pelo código, para quando a resposta não deu para entender."""
    return f"Desculpa, não entendi direito. Você consegue vir dia {slot.inicio:%d/%m} às {slot.hora}? Pode responder sim ou não."


def sem_candidatas(candidatos: list[Candidato]) -> str:
    """Explica por que o agente decidiu não mexer quando ninguém sobrou."""
    podadas = [c for c in candidatos if c.motivo == "valor_negativo"]
    if podadas:
        nomes = ", ".join(f"{c.nome} (R$ {c.valor_esperado:.2f})" for c in podadas)
        return f"Não compensa mexer: puxar qualquer uma deixaria a agenda pior. Valor esperado: {nomes}."
    recusaram = [c.nome for c in candidatos if c.motivo == "recusou"]
    if recusaram:
        return f"Ninguém mais para chamar: {', '.join(recusaram)} já recusou nesta cascata."
    return "Não compensa mexer: nenhuma cliente pode ocupar este horário."


TEXTO_LIMITE = f"Limite de cascata atingido ({MAX_PROF} níveis). Este horário fica para a fila de espera."


def _encerrar(passos: list[Passo], atores: Atores, passo: Passo) -> list[Passo]:
    """Fecha a cascata com o último passo."""
    passos.append(passo)
    atores.avisar("fim", {"passo": passo})
    return passos
