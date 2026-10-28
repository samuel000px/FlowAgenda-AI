"""Registro de visitas, faltas e propostas: uma linha por acontecimento, num CSV.

Os números de cada cliente são o cadastro (data/clientes.json) mais a soma destas linhas. Uma linha
por evento é fácil de conferir, de abrir no Excel e de virar uma aba do Google Planilhas depois.
"""
import csv
import os
from dataclasses import replace
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from src.modelos import Cliente

load_dotenv()

PASTA = Path(__file__).resolve().parent.parent
ARQUIVO_PADRAO = PASTA / (os.getenv("HISTORICO_ARQUIVO") or "registro/historico.csv")
COLUNAS = ["data_hora", "cliente_id", "evento", "slot_id"]

# o que cada evento soma nos números da cliente
EFEITOS = {
    "veio": {"consultas_total": 1},
    "faltou": {"consultas_total": 1, "faltas": 1},
    "proposta_aceita": {"propostas_recebidas": 1, "propostas_aceitas": 1},
    "proposta_recusada": {"propostas_recebidas": 1},
    "proposta_sem_resposta": {"propostas_recebidas": 1},
}


class Historico:
    """O registro em arquivo. Cria a pasta e o cabeçalho na primeira vez."""

    def __init__(self, arquivo: Path = ARQUIVO_PADRAO):
        self.arquivo = Path(arquivo)

    def registrar(self, cliente_id: str, evento: str, slot_id: str = "", quando: datetime | None = None) -> None:
        """Acrescenta uma linha. Nunca apaga nem reescreve o que já está lá."""
        if evento not in EFEITOS:
            raise ValueError(f"Evento desconhecido: {evento!r}. Use um de: {', '.join(EFEITOS)}.")
        novo = not self.arquivo.exists()
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        with self.arquivo.open("a", newline="", encoding="utf-8") as f:
            escritor = csv.DictWriter(f, fieldnames=COLUNAS)
            if novo:
                escritor.writeheader()
            momento = (quando or datetime.now()).isoformat(timespec="minutes")
            escritor.writerow({"data_hora": momento, "cliente_id": cliente_id, "evento": evento, "slot_id": slot_id})

    def eventos(self) -> list[dict]:
        """Todas as linhas, da mais antiga para a mais nova."""
        if not self.arquivo.exists():
            return []
        with self.arquivo.open(newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def presenca_marcada(self, slot_id: str) -> str | None:
        """'veio' ou 'faltou' se esse horário já foi fechado; None se ainda não."""
        for e in reversed(self.eventos()):
            if e["slot_id"] == slot_id and e["evento"] in ("veio", "faltou"):
                return e["evento"]
        return None


class SemHistorico(Historico):
    """Padrão nos testes, no terminal e na avaliação: não grava nada."""

    def __init__(self):
        super().__init__(Path(os.devnull))

    def registrar(self, cliente_id: str, evento: str, slot_id: str = "", quando: datetime | None = None) -> None:
        """Confere o evento, mas não grava."""
        if evento not in EFEITOS:
            raise ValueError(f"Evento desconhecido: {evento!r}.")

    def eventos(self) -> list[dict]:
        """Nada gravado."""
        return []


def aplicar(clientes: dict[str, Cliente], eventos: list[dict]) -> dict[str, Cliente]:
    """Cadastro + registro: soma cada evento nos números da cliente. Não altera o cadastro original."""
    somas: dict[str, dict[str, int]] = {}
    for e in eventos:
        if e["cliente_id"] not in clientes or e["evento"] not in EFEITOS:
            continue  # linha de uma cliente que saiu do cadastro, ou digitada errado: não quebra nada
        for campo, valor in EFEITOS[e["evento"]].items():
            somas.setdefault(e["cliente_id"], {}).setdefault(campo, 0)
            somas[e["cliente_id"]][campo] += valor
    atualizadas = dict(clientes)
    for cid, soma in somas.items():
        c = clientes[cid]
        atualizadas[cid] = replace(c, **{campo: getattr(c, campo) + v for campo, v in soma.items()})
    return atualizadas
