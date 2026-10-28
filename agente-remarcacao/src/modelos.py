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
    consultas_total: int  # visitas
    faltas: int
    propostas_recebidas: int  # contadas pelo próprio sistema
    propostas_aceitas: int
    disposicao: int  # 0 a 10, dita pela cliente: quanto toparia trocar para um horário antes. 0 = nunca chamar

    @property
    def primeiro_nome(self) -> str:
        """Só o primeiro nome: é o que vai para o modelo e para a mensagem."""
        return self.nome.split()[0]


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

    def antecedencia_h(self, slot: Slot) -> float:
        """Quantas horas faltam, a partir de 'agora', para o horário começar."""
        return (slot.inicio - self.agora).total_seconds() / 3600


@dataclass(frozen=True)
class Buraco:
    """Horário vago do jeito que o score enxerga: quanto vale, quanto aviso tem e quanta fila."""

    valor: float
    antecedencia_h: float
    fila: int


@dataclass
class Candidato:
    """Uma cliente avaliada para ocupar o horário vago."""

    cliente_id: str
    nome: str
    slot_atual_id: str
    motivo: str | None  # None = pode receber proposta; senão, por que ficou de fora
    taxa_falta: float | None = None
    prob_aceitar: float | None = None
    antecedencia_novo_h: float | None = None  # aviso que sobraria para preencher o horário dela
    fila_novo: int | None = None
    dificuldade_novo: float | None = None
    ganho: float | None = None
    risco: float | None = None
    valor_esperado: float | None = None

    @property
    def elegivel(self) -> bool:
        """Passou pelos filtros e pela poda."""
        return self.motivo is None


@dataclass
class Decisao:
    """O que o modelo escolheu. É só uma proposta: nada muda sem aprovação."""

    cliente_id: str | None  # None = decidiu não mexer
    justificativa: str
    mensagem: str | None
    log: list[dict]
