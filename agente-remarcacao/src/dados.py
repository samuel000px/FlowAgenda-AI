"""Lê os arquivos de data/ e confere se fazem sentido antes de usar."""
import json
import re
from datetime import datetime
from pathlib import Path

from src.modelos import Cenario, Cliente, Dia, Slot

PASTA_DADOS = Path(__file__).resolve().parent.parent / "data"
HORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ErroDados(Exception):
    """Algum arquivo de dados está inconsistente."""


def _ler(pasta: Path, nome: str):
    """Abre um JSON de data/."""
    caminho = pasta / nome
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise ErroDados(f"Arquivo {caminho} não encontrado.") from e
    except json.JSONDecodeError as e:
        raise ErroDados(f"{caminho} não é um JSON válido: {e}") from e


def carregar_clientes(pasta: Path = PASTA_DADOS) -> dict[str, Cliente]:
    """Lê clientes.json e valida cada cliente."""
    clientes: dict[str, Cliente] = {}
    for bruto in _ler(pasta, "clientes.json"):
        try:
            c = Cliente(**bruto)
        except TypeError as e:
            raise ErroDados(f"Cliente com campos errados ({bruto.get('id')}): {e}") from e
        if c.id in clientes:
            raise ErroDados(f"Cliente {c.id} repetida.")
        if not 0 <= c.faltas <= c.consultas_total:
            raise ErroDados(f"{c.id}: faltas precisa ficar entre 0 e consultas_total.")
        if not 0 <= c.propostas_aceitas <= c.propostas_recebidas:
            raise ErroDados(f"{c.id}: propostas_aceitas precisa ficar entre 0 e propostas_recebidas.")
        if c.duracao_min <= 0 or c.deslocamento_min < 0:
            raise ErroDados(f"{c.id}: duração e deslocamento precisam ser positivos.")
        if c.janela_preferida is not None:
            if not c.janela_preferida or set(c.janela_preferida) - {"apos", "antes"}:
                raise ErroDados(f"{c.id}: janela_preferida só aceita as chaves 'apos' e 'antes'.")
            if not all(HORA.match(h) for h in c.janela_preferida.values()):
                raise ErroDados(f"{c.id}: janela_preferida precisa estar no formato HH:MM.")
        clientes[c.id] = c
    return clientes


def _carregar_agenda(bruto: dict, cenario_id: str, clientes: dict[str, Cliente]) -> tuple[list[Slot], dict[str, Dia]]:
    """Monta os horários e os dias de um cenário, conferindo as referências."""
    dias = {data: Dia(**d) for data, d in bruto["dias"].items()}
    agenda: list[Slot] = []
    vistos_slot, vistos_cliente = set(), set()
    for s in bruto["slots"]:
        slot = Slot(**s)
        onde = f"{cenario_id}/{slot.id}"
        if slot.id in vistos_slot:
            raise ErroDados(f"{onde}: id de slot repetido.")
        if not HORA.match(slot.hora):
            raise ErroDados(f"{onde}: hora precisa estar no formato HH:MM.")
        if slot.data not in dias:
            raise ErroDados(f"{onde}: o dia {slot.data} não está em 'dias'.")
        if slot.status not in ("ocupado", "livre"):
            raise ErroDados(f"{onde}: status precisa ser 'ocupado' ou 'livre'.")
        if slot.status == "ocupado":
            cliente = clientes.get(slot.cliente_id)
            if cliente is None:
                raise ErroDados(f"{onde}: cliente {slot.cliente_id} não existe.")
            # cada cliente tem um agendamento só; é ele que pode ser antecipado
            if slot.cliente_id in vistos_cliente:
                raise ErroDados(f"{onde}: {slot.cliente_id} aparece em mais de um horário.")
            if cliente.tipo_atendimento != slot.tipo_atendimento:
                raise ErroDados(f"{onde}: o tipo do horário não bate com o da cliente.")
            vistos_cliente.add(slot.cliente_id)
        vistos_slot.add(slot.id)
        agenda.append(slot)
    return agenda, dias


def carregar_cenarios(pasta: Path = PASTA_DADOS) -> list[Cenario]:
    """Lê os três arquivos e devolve todos os cenários prontos para uso."""
    clientes = carregar_clientes(pasta)
    agendas = _ler(pasta, "agenda.json")
    cenarios = []
    for bruto in _ler(pasta, "cenarios.json"):
        cid = bruto["id"]
        if cid not in agendas:
            raise ErroDados(f"Cenário {cid} não tem agenda em agenda.json.")
        agenda, dias = _carregar_agenda(agendas[cid], cid, clientes)
        cenario = Cenario(
            id=cid,
            nome=bruto["nome"],
            o_que_prova=bruto["o_que_prova"],
            agora=datetime.fromisoformat(bruto["agora"]),
            slot_cancelado_id=bruto["cancelamento"]["slot_id"],
            clientes=clientes,
            agenda=agenda,
            dias=dias,
            respostas=bruto.get("respostas", {}),
            esperado=bruto["esperado"],
        )
        _validar_cancelamento(cenario)
        cenarios.append(cenario)
    return cenarios


def carregar_cenario(cenario_id: str, pasta: Path = PASTA_DADOS) -> Cenario:
    """Atalho para pegar um cenário pelo id (ex.: "S1")."""
    for c in carregar_cenarios(pasta):
        if c.id == cenario_id:
            return c
    raise ErroDados(f"Cenário {cenario_id} não existe.")


def _validar_cancelamento(c: Cenario) -> None:
    """O horário cancelado precisa existir, estar ocupado e ser depois de 'agora'."""
    try:
        slot = c.slot(c.slot_cancelado_id)
    except KeyError as e:
        raise ErroDados(str(e)) from e
    if slot.status != "ocupado":
        raise ErroDados(f"{c.id}: o horário cancelado precisa estar ocupado antes do cancelamento.")
    if slot.inicio <= c.agora:
        raise ErroDados(f"{c.id}: o horário cancelado precisa ser depois de 'agora'.")
    desconhecidas = set(c.respostas) - set(c.clientes)
    if desconhecidas:
        raise ErroDados(f"{c.id}: respostas para clientes que não existem: {sorted(desconhecidas)}.")


if __name__ == "__main__":
    for c in carregar_cenarios():
        print(f"{c.id} {c.nome}: {len(c.agenda)} horários, agora {c.agora:%d/%m %H:%M}, cancela {c.slot_cancelado_id}")
