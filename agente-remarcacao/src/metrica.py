"""Métrica da avaliação: horas vagas esperadas no fim (ver docs/metrica.md)."""
from src.modelos import Cenario
from src.score import dificuldade_de_preencher, taxa_falta


def horas_vagas_esperadas(original: Cenario, final: Cenario) -> float:
    """Soma, nos horários que mudaram de dono, a chance de cada um ficar vazio vezes a duração."""
    total = 0.0
    for antes in original.agenda:
        depois = final.slot(antes.id)
        if antes.cliente_id == depois.cliente_id and antes.status == depois.status:
            continue  # horário que ninguém mexeu: igual em todas as estratégias, fica fora da soma
        horas = depois.duracao_min / 60
        if depois.status == "livre":
            dia = final.dias[depois.data]
            total += horas * dificuldade_de_preencher(final.antecedencia_h(depois), dia.fila_espera)
        else:
            cliente = final.clientes[depois.cliente_id]
            total += horas * taxa_falta(cliente.faltas, cliente.consultas_total)
    return total
