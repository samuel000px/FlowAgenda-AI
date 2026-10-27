"""O fluxo da cascata quebrado em etapas, para a interface.

O Streamlit roda o script de novo a cada clique, então não dá para ter um laço que "espera" a
cliente responder. Aqui cada botão chama um método que leva o fluxo de um estado para o próximo:

    candidatos_calculados -> (pedir_decisao) -> aguardando_resposta -> (responder) -> aguardando_aprovacao
        -> (aprovar) -> candidatos_calculados do próximo nível ... até um estado final.
    Recusa volta para candidatos_calculados sem quem recusou.

As regras são as mesmas da cascata (src/cascata.py).
"""
import copy
from dataclasses import dataclass

from src.agenda_externa import AgendaExterna, SemAgendaExterna
from src.agente import decidir as decidir_com_modelo
from src.canal import CanalSimulado
from src.cascata import MAX_PROF, TEXTO_LIMITE, Passo, pergunta_de_esclarecimento, sem_candidatas
from src.ferramentas import aplicar_movimento_aprovado, buscar_candidatos, liberar_horario
from src.interpretacao import Interpretacao
from src.interpretacao import interpretar as interpretar_com_modelo
from src.modelos import Candidato, Cenario, Decisao

FINAIS = ("decidiu_nao_agir", "limite_atingido", "rejeitado")
ETAPAS = ("Filtros duros", "Score", "Poda", "Decisão do agente", "Resposta interpretada", "Aprovação humana")


@dataclass
class Movimento:
    """Uma cliente antecipada: de onde saiu e para onde foi."""

    cliente_id: str
    de_slot_id: str
    para_slot_id: str


class Fluxo:
    """Estado de um cenário em andamento na tela."""

    def __init__(
        self,
        cenario: Cenario,
        decidir=decidir_com_modelo,
        interpretar=interpretar_com_modelo,
        agenda_externa: AgendaExterna | None = None,
    ):
        self.original = cenario
        self.agenda_externa = agenda_externa or SemAgendaExterna()
        self.cenario = copy.deepcopy(cenario)
        self.decidir, self.interpretar = decidir, interpretar
        self.canal = CanalSimulado()
        self.profundidade = 0
        self.recusados: frozenset = frozenset()
        self.passos: list[Passo] = []
        self.movimentos: list[Movimento] = []
        self.candidatos: list[Candidato] = []
        self.decisao: Decisao | None = None
        self.interpretacao: Interpretacao | None = None
        self.cliente_atual: str | None = None
        self.ja_esclareceu = False
        self.estado = "inicio"

        self.slot_atual = cenario.slot_cancelado_id
        self.quem_cancelou = cenario.clientes[cenario.slot(self.slot_atual).cliente_id].nome
        liberar_horario(self.cenario, self.slot_atual)
        self._calcular_candidatos()

    @property
    def terminou(self) -> bool:
        """Chegou num estado final."""
        return self.estado in FINAIS

    @property
    def etapa(self) -> int:
        """Índice em ETAPAS da etapa atual, para destacar na tela."""
        return {"candidatos_calculados": 3, "aguardando_resposta": 4, "aguardando_aprovacao": 5}.get(self.estado, 2)

    def pedir_decisao(self) -> None:
        """Botão "Pedir decisão ao agente": chama o modelo e envia a mensagem pelo canal."""
        self._exigir("candidatos_calculados")
        self.decisao = self.decidir(self.cenario, self.slot_atual, self.recusados, self.profundidade)
        self.interpretacao = None
        if self.decisao.cliente_id is None:
            self._finalizar("decidiu_nao_agir", self.decisao.justificativa)
            return
        self.cliente_atual = self.decisao.cliente_id
        self.ja_esclareceu = False
        self.canal.enviar(self.cliente_atual, self.decisao.mensagem)
        self.estado = "aguardando_resposta"

    def responder(self, texto: str) -> None:
        """A pessoa responde como a cliente; o modelo interpreta."""
        self._exigir("aguardando_resposta")
        ultima_do_agente = [m for m in self.canal.conversa(self.cliente_atual) if m.de == "agente"][-1].texto
        self.canal.responder(self.cliente_atual, texto)
        interp = self.interpretar(ultima_do_agente, texto)
        self.interpretacao = interp
        if interp.resultado == "ambiguo" and not self.ja_esclareceu:
            self.ja_esclareceu = True
            self.canal.enviar(self.cliente_atual, pergunta_de_esclarecimento(self.cenario.slot(self.slot_atual)))
            return  # continua esperando resposta
        if interp.resultado == "ambiguo":
            interp.resultado = "recusou"
        if interp.resultado == "aceitou":
            self.estado = "aguardando_aprovacao"
            return
        # recusou ou pediu outro horário: plano B na mesma vaga
        self.passos.append(self._passo("recusou", texto))
        self.recusados = self.recusados | {self.cliente_atual}
        self._calcular_candidatos()

    def aprovar(self) -> None:
        """Botão "Aprovar e atualizar agenda": só aqui a agenda muda."""
        self._exigir("aguardando_aprovacao")
        resposta = self.canal.conversa(self.cliente_atual)[-1].texto
        novo = aplicar_movimento_aprovado(self.cenario, self.cliente_atual, self.slot_atual, self.agenda_externa)
        passo = self._passo("aceitou", resposta)
        passo.novo_buraco_id = novo.id
        self.passos.append(passo)
        self.movimentos.append(Movimento(self.cliente_atual, novo.id, self.slot_atual))
        # o horário que ela deixou vira um novo cancelamento
        self.profundidade += 1
        self.slot_atual = novo.id
        self.cliente_atual = None
        self._calcular_candidatos()

    def rejeitar(self) -> None:
        """Botão "Rejeitar": a agenda não muda e o fluxo para."""
        self._exigir("aguardando_aprovacao")
        self.passos.append(self._passo("rejeitado", self.canal.conversa(self.cliente_atual)[-1].texto))
        self.estado = "rejeitado"

    def _calcular_candidatos(self) -> None:
        """Filtros, score e poda do horário atual."""
        self.decisao = None
        if self.profundidade > MAX_PROF:
            self.candidatos = []
            self._finalizar("limite_atingido", TEXTO_LIMITE)
            return
        self.candidatos = buscar_candidatos(self.cenario, self.slot_atual, self.recusados)
        if not any(c.elegivel for c in self.candidatos):
            self._finalizar("decidiu_nao_agir", sem_candidatas(self.candidatos))
            return
        self.estado = "candidatos_calculados"

    def _finalizar(self, estado: str, justificativa: str) -> None:
        resultado = "limite" if estado == "limite_atingido" else "nao_agir"
        self.passos.append(Passo(self.profundidade, self.slot_atual, resultado, justificativa=justificativa))
        self.estado = estado

    def _passo(self, resultado: str, resposta: str) -> Passo:
        return Passo(
            self.profundidade, self.slot_atual, resultado, self.cliente_atual, self.decisao.justificativa,
            self.decisao.mensagem, resposta, self.interpretacao.resultado if self.interpretacao else None,
        )

    def _exigir(self, estado: str) -> None:
        if self.estado != estado:
            raise RuntimeError(f"Ação fora de hora: o fluxo está em '{self.estado}', não em '{estado}'.")
