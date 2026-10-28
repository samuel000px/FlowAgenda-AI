"""Regras duras: quem não passa aqui nem chega a ser mostrado para o modelo."""
import os
from collections.abc import Collection
from datetime import datetime

from dotenv import load_dotenv

from src.modelos import Cliente, Slot

load_dotenv()

# Abaixo deste aviso, o salão nem tenta encaixar ninguém. Ajustável no .env.
AVISO_MINIMO_H = float(os.getenv("AVISO_MINIMO_H") or 1)

# Texto mostrado na interface para cada motivo de exclusão.
MOTIVOS = {
    "tipo": "Serviço diferente",
    "duracao": "Não cabe no horário",
    "nao_posterior": "Horário dela já é antes",
    "aviso_curto": "Pouco aviso para encaixar",
    "nao_quer": "Não quer ser chamada",
    "recusou": "Já recusou",
    "valor_negativo": "Podada (não compensa)",
}


def motivo_de_exclusao(
    cliente: Cliente,
    slot_dela: Slot,
    vago: Slot,
    agora: datetime,
    recusados: Collection[str] = (),
    aviso_minimo_h: float = AVISO_MINIMO_H,
) -> str | None:
    """Devolve o primeiro filtro em que a cliente cai, ou None se ela pode receber proposta."""
    if cliente.tipo_atendimento != vago.tipo_atendimento:
        return "tipo"
    if cliente.duracao_min > vago.duracao_min:
        return "duracao"
    if slot_dela.inicio <= vago.inicio:
        return "nao_posterior"  # só faz sentido antecipar quem está marcada para depois
    # Não guardamos distância (perto de casa não é perto do trabalho). A própria cliente diz se
    # consegue chegar; o salão só define um aviso mínimo para nem tentar.
    if (vago.inicio - agora).total_seconds() / 3600 < aviso_minimo_h:
        return "aviso_curto"
    if cliente.disposicao == 0:
        return "nao_quer"  # ela disse que não quer trocar de horário
    if cliente.id in recusados:
        return "recusou"
    return None
