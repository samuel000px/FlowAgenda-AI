"""Por onde as mensagens vão e voltam. Hoje é um chat de mentira; amanhã pode ser WhatsApp."""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Mensagem:
    """Uma bolha do chat."""

    cliente_id: str
    de: str  # "agente" ou "cliente"
    texto: str


class Canal(ABC):
    """O agente só conhece esta interface, então trocar o canal não mexe no agente."""

    @abstractmethod
    def enviar(self, cliente_id: str, texto: str) -> None:
        """Manda uma mensagem para a cliente."""

    @abstractmethod
    def receber(self, cliente_id: str) -> str | None:
        """Devolve a resposta da cliente, ou None se ela ainda não respondeu."""


class CanalSimulado(Canal):
    """Nada sai do computador. As respostas vêm de quem está testando ou de respostas prontas."""

    def __init__(self, respostas_prontas: dict[str, str] | None = None, perguntar=None):
        self.historico: list[Mensagem] = []
        self.respostas_prontas = dict(respostas_prontas or {})
        # no terminal, quem testa digita a resposta; sem isso, receber() devolve None
        self.perguntar = perguntar

    def enviar(self, cliente_id: str, texto: str) -> None:
        """Registra a mensagem do agente no histórico."""
        self.historico.append(Mensagem(cliente_id, "agente", texto))

    def responder(self, cliente_id: str, texto: str) -> None:
        """Quem está testando responde no lugar da cliente."""
        self.historico.append(Mensagem(cliente_id, "cliente", texto))

    def receber(self, cliente_id: str) -> str | None:
        """Última resposta da cliente depois da última mensagem do agente."""
        conversa = [m for m in self.historico if m.cliente_id == cliente_id]
        if conversa and conversa[-1].de == "cliente":
            return conversa[-1].texto
        # sem resposta digitada: usa a resposta pronta do cenário, uma vez só
        pronta = self.respostas_prontas.pop(cliente_id, None)
        if pronta is None and self.perguntar is not None:
            pronta = self.perguntar(cliente_id)
        if pronta is not None:
            self.responder(cliente_id, pronta)
        return pronta

    def conversa(self, cliente_id: str) -> list[Mensagem]:
        """Todas as mensagens trocadas com uma cliente."""
        return [m for m in self.historico if m.cliente_id == cliente_id]
