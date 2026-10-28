"""Textos curtos para as telas: datas, situação de um horário, valores. Não usa Streamlit."""
from datetime import date

from src.modelos import Cenario, Slot

DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def sem_formula(texto: str) -> str:
    """No markdown do Streamlit, dois "$" viram fórmula; "R$ 10 ... R$ 20" quebrava o texto."""
    return texto.replace("$", r"\$")


def quando(slot: Slot) -> str:
    """Ex.: qua 28/10 13:00."""
    return f"{DIAS[slot.inicio.weekday()]} {slot.inicio:%d/%m %H:%M}"


def nome_do_dia(data_iso: str) -> str:
    """Ex.: qua 28/10."""
    dia = date.fromisoformat(data_iso)
    return f"{DIAS[dia.weekday()]} {dia:%d/%m}"


def descrever_horario(antes: Slot, depois: Slot, original: Cenario, atual: Cenario) -> str:
    """Como um horário estava e como está agora: igual, cancelado, antecipada ou vago."""
    nome_antes = original.clientes[antes.cliente_id].nome if antes.cliente_id else None
    if depois.cliente_id == antes.cliente_id:
        return nome_antes or "livre"

    if antes.id == original.slot_cancelado_id:
        origem = f"~~{nome_antes}~~ cancelou"
    elif nome_antes:
        origem = f"~~{nome_antes}~~ antecipada"
    else:
        origem = "livre"

    if depois.status == "ocupado":
        destino = f"**{atual.clientes[depois.cliente_id].nome}** (antecipada)"
    else:
        fila = atual.dias[depois.data].fila_espera
        destino = f":orange[**horário vago**] · {atual.antecedencia_h(depois):.0f}h de aviso · fila {fila}"
    return f"{origem} → {destino}"
