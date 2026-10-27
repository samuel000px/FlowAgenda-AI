"""Estruturas de dados do domínio: cliente, horário, dia e cenário."""
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Cliente:
    """Cliente da esmalteria com o histórico usado no score."""

    id: str
    nome: str
    tipo_atendimento: str
    duracao_min: int
    consultas_total: int
    faltas: int
    propostas_recebidas: int
    propostas_aceitas: int
    deslocamento_min: int
    nota_livre: str
    janela_preferida: dict[str, str] | None  # {"apos": "16:00"}, {"antes": "12:00"} ou None


@dataclass
class Slot:
    """Um horário da agenda."""

    id: str
    data: str  # "2026-10-28"
    hora: str  # "13:00"
    duracao_min: int
    tipo_atendimento: str
    status: str  # "ocupado" ou "livre"
    cliente_id: str | None
    valor: float

    @property
    def inicio(self) -> datetime:
        """Data e hora de início juntas."""
        return datetime.fromisoformat(f"{self.data}T{self.hora}")


@dataclass(frozen=True)
class Dia:
    """Como está o dia: ocupação e quantas pessoas esperam vaga."""

    ocupacao_pct: int
    fila_espera: int


@dataclass
class Cenario:
    """Uma situação de teste: agenda, momento atual e o cancelamento."""

    id: str
    nome: str
    o_que_prova: str
    agora: datetime  # fixo no arquivo, nunca o relógio do computador
    slot_cancelado_id: str
    clientes: dict[str, Cliente]
    agenda: list[Slot]
    dias: dict[str, Dia]
    respostas: dict[str, str]  # resposta pronta de cada cliente, para rodar sem interface
    esperado: dict

    def slot(self, slot_id: str) -> Slot:
        """Busca um horário pelo id."""
        for s in self.agenda:
            if s.id == slot_id:
                return s
        raise KeyError(f"Slot {slot_id} não existe no cenário {self.id}.")

    def agendamento_atual(self, cliente_id: str) -> Slot | None:
        """Horário que a cliente tem marcado neste cenário (no máximo um)."""
        for s in self.agenda:
            if s.status == "ocupado" and s.cliente_id == cliente_id:
                return s
        return None
