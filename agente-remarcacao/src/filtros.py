"""Regras duras: quem não passa aqui nem chega a ser mostrado para o modelo."""
from collections.abc import Collection
from datetime import datetime, timedelta

from src.modelos import Cliente, Slot

# Texto mostrado na interface para cada motivo de exclusão.
MOTIVOS = {
    "tipo": "Serviço diferente",
    "duracao": "Não cabe no horário",
    "nao_posterior": "Horário dela já é antes",
    "janela": "Fora da janela",
    "chegada": "Não chega a tempo",
    "recusou": "Já recusou",
    "valor_negativo": "Podada (não compensa)",
}


def motivo_de_exclusao(
    cliente: Cliente, slot_dela: Slot, vago: Slot, agora: datetime, recusados: Collection[str] = ()
) -> str | None:
    """Devolve o primeiro filtro em que a cliente cai, ou None se ela pode receber proposta."""
    if cliente.tipo_atendimento != vago.tipo_atendimento:
        return "tipo"
    if cliente.duracao_min > vago.duracao_min:
        return "duracao"
    if slot_dela.inicio <= vago.inicio:
        return "nao_posterior"  # só faz sentido antecipar quem está marcada para depois
    if not respeita_janela(cliente, vago):
        return "janela"
    if not chega_a_tempo(cliente, vago, agora):
        return "chegada"
    if cliente.id in recusados:
        return "recusou"
    return None


def respeita_janela(cliente: Cliente, vago: Slot) -> bool:
    """O horário começa depois do 'apos' e termina até o 'antes' da cliente."""
    janela = cliente.janela_preferida
    if not janela:
        return True
    # "HH:MM" com zero à esquerda pode ser comparado como texto
    if "apos" in janela and vago.hora < janela["apos"]:
        return False
    fim = (vago.inicio + timedelta(minutes=cliente.duracao_min)).strftime("%H:%M")
    if "antes" in janela and fim > janela["antes"]:
        return False
    return True


def chega_a_tempo(cliente: Cliente, vago: Slot, agora: datetime) -> bool:
    """O aviso que sobra é pelo menos o tempo de deslocamento dela."""
    # mesma ideia do Encaixa (Samuel Almeida): agora + deslocamento precisa caber antes do horário
    antecedencia_h = (vago.inicio - agora).total_seconds() / 3600
    return antecedencia_h >= cliente.deslocamento_min / 60
