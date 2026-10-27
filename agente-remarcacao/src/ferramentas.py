"""Ações sobre a agenda.

buscar_candidatos só lê. confirmar_movimento muda a agenda e por isso nunca é oferecida ao
modelo: o código chama depois que uma pessoa aprova.
"""
from collections.abc import Collection

from src.filtros import MOTIVOS, motivo_de_exclusao
from src.modelos import Buraco, Candidato, Cenario, Slot
from src.score import dificuldade_de_preencher, ganho_e_risco, prob_aceitar, taxa_falta


class ErroMovimento(Exception):
    """A mudança pedida na agenda não é válida."""


def liberar_horario(cenario: Cenario, slot_id: str) -> Slot:
    """Registra o cancelamento: o horário fica livre."""
    slot = cenario.slot(slot_id)
    if slot.status != "ocupado":
        raise ErroMovimento(f"O horário {slot_id} já estava livre.")
    slot.status, slot.cliente_id = "livre", None
    return slot


def buraco(cenario: Cenario, slot: Slot) -> Buraco:
    """Valor, aviso e fila de um horário, para o score."""
    return Buraco(slot.valor, cenario.antecedencia_h(slot), cenario.dias[slot.data].fila_espera)


def buscar_candidatos(cenario: Cenario, slot_id: str, recusados: Collection[str] = ()) -> list[Candidato]:
    """Avalia todas as clientes com horário marcado: filtros, depois score, depois poda."""
    vago = cenario.slot(slot_id)
    if vago.status != "livre":
        raise ErroMovimento(f"O horário {slot_id} não está livre.")
    buraco_atual = buraco(cenario, vago)

    candidatos = []
    for slot in cenario.agenda:
        if slot.status != "ocupado":
            continue
        cliente = cenario.clientes[slot.cliente_id]
        motivo = motivo_de_exclusao(cliente, slot, vago, cenario.agora, recusados)
        c = Candidato(cliente.id, cliente.nome, slot.id, motivo)
        if motivo is None:
            buraco_novo = buraco(cenario, slot)
            c.taxa_falta = taxa_falta(cliente.faltas, cliente.consultas_total)
            c.prob_aceitar = prob_aceitar(cliente.propostas_aceitas, cliente.propostas_recebidas)
            c.antecedencia_novo_h = buraco_novo.antecedencia_h
            c.fila_novo = buraco_novo.fila
            c.dificuldade_novo = dificuldade_de_preencher(buraco_novo.antecedencia_h, buraco_novo.fila)
            c.ganho, c.risco = ganho_e_risco(cliente, buraco_atual, buraco_novo)
            c.valor_esperado = c.ganho - c.risco
            if c.valor_esperado <= 0:
                c.motivo = "valor_negativo"  # poda: mexer deixaria a agenda pior
        candidatos.append(c)

    # Elegíveis primeiro (maior valor esperado no topo), depois as podadas, depois o resto.
    def ordem(c: Candidato) -> tuple:
        grupo = 0 if c.elegivel else 1 if c.motivo == "valor_negativo" else 2
        return (grupo, -(c.valor_esperado or 0), cenario.slot(c.slot_atual_id).inicio)

    return sorted(candidatos, key=ordem)


def confirmar_movimento(cenario: Cenario, cliente_id: str, slot_id: str) -> Slot:
    """Passa a cliente para o horário vago e devolve o horário que ela deixou (o novo buraco)."""
    vago = cenario.slot(slot_id)
    if vago.status != "livre":
        raise ErroMovimento(f"O horário {slot_id} não está mais livre.")
    origem = cenario.agendamento_atual(cliente_id)
    if origem is None:
        raise ErroMovimento(f"{cliente_id} não tem horário marcado para trocar.")
    # Confere as regras de novo antes de gravar, como o Encaixa (Samuel Almeida) faz no aceite.
    motivo = motivo_de_exclusao(cenario.clientes[cliente_id], origem, vago, cenario.agora)
    if motivo is not None:
        raise ErroMovimento(f"{cliente_id} não pode ir para {slot_id}: {MOTIVOS[motivo]}.")

    vago.status, vago.cliente_id = "ocupado", cliente_id
    origem.status, origem.cliente_id = "livre", None
    return origem
