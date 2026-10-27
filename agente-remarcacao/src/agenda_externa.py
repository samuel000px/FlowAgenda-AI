"""Ponte para uma agenda de fora, como o Google Agenda.

O agente não sabe de onde vem a agenda. Ele só conhece esta interface, do mesmo jeito que só
conhece `Canal` para as mensagens. Guia de integração: docs/integracao-google-agenda.md.
"""
from abc import ABC, abstractmethod
from datetime import datetime

from src.modelos import Slot


class AgendaExterna(ABC):
    """O que uma agenda de fora precisa oferecer."""

    @abstractmethod
    def carregar_slots(self, inicio: datetime, fim: datetime) -> list[dict]:
        """Horários do período, cada um no mesmo formato de um slot de data/agenda.json."""

    @abstractmethod
    def registrar_movimento(self, cliente_id: str, de: Slot, para: Slot) -> None:
        """A cliente saiu de `de` e foi para `para`. Só é chamado depois da aprovação humana."""


class SemAgendaExterna(AgendaExterna):
    """Padrão: a agenda vem de data/ e nenhuma mudança sai do computador."""

    def carregar_slots(self, inicio: datetime, fim: datetime) -> list[dict]:
        """Não há agenda de fora para ler."""
        return []

    def registrar_movimento(self, cliente_id: str, de: Slot, para: Slot) -> None:
        """Nada para sincronizar: a mudança fica só na memória."""
        return None
