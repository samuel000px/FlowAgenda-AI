"""Escolha da cliente feita só pelo código: a primeira da lista, com justificativa e mensagem prontas.

Os critérios que ensinaríamos ao modelo são os mesmos da conta (D25), e nos casos difíceis o modelo às
vezes se afastou deles para pior. Assim, a IA fica só para entender as respostas das clientes.
"""
from collections.abc import Collection

from src.ferramentas import buscar_candidatos
from src.modelos import Candidato, Cenario, Decisao, Slot

DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def reais(valor: float) -> str:
    """R$ 22,37."""
    return f"R$ {valor:.2f}".replace(".", ",")


def decidir_pelo_codigo(
    cenario: Cenario, slot_id: str, recusados: Collection[str] = (), profundidade: int = 0
) -> Decisao:
    """Mesmo formato da decisão do modelo, para a cascata e a tela não precisarem mudar."""
    elegiveis = [c for c in buscar_candidatos(cenario, slot_id, recusados) if c.elegivel]
    if not elegiveis:
        return Decisao(None, "Nenhuma candidata com valor esperado positivo.", None, [])
    escolhida = elegiveis[0]
    vago = cenario.slot(slot_id)
    return Decisao(
        escolhida.cliente_id,
        justificativa(cenario, escolhida, elegiveis[1:]),
        mensagem(cenario, escolhida, vago),
        [{"tipo": "escolha_pelo_codigo", "candidatas": [c.cliente_id for c in elegiveis]}],
    )


def justificativa(cenario: Cenario, c: Candidato, outras: list[Candidato]) -> str:
    """Os números que fizeram dela a primeira da lista."""
    cliente = cenario.clientes[c.cliente_id]
    texto = (
        f"{cliente.primeiro_nome} tem o maior valor esperado ({reais(c.valor_esperado)}): "
        f"{cliente.faltas} faltas em {cliente.consultas_total} atendimentos, aceitou "
        f"{cliente.propostas_aceitas} de {cliente.propostas_recebidas} propostas, nota {cliente.disposicao}/10 "
        f"(chance de aceitar {c.prob_aceitar:.0%}), e o horário dela ficaria com {c.antecedencia_novo_h:.0f}h "
        f"de aviso e {c.fila_novo} na fila."
    )
    if c.escolheu_tarde:
        texto += " Ela marcou tarde havendo horário antes, então a nota entrou rebaixada."
    if not c.mesma_profissional:
        texto += " Prefere outra profissional, mas ninguém que prefere a deste horário sobrou."
    if outras:
        seguinte = outras[0]
        empate = abs(seguinte.valor_esperado - c.valor_esperado) < 0.01
        texto += (
            f" {'Empatada' if empate else 'Logo depois vem'} {cenario.clientes[seguinte.cliente_id].primeiro_nome} "
            f"({reais(seguinte.valor_esperado)}){', e a ordem da lista desempata' if empate else ''}."
        )
    return texto


def mensagem(cenario: Cenario, c: Candidato, vago: Slot) -> str:
    """Texto pronto da proposta: dia, hora, profissional e a opção de manter o horário."""
    cliente = cenario.clientes[c.cliente_id]
    dela = cenario.slot(c.slot_atual_id)
    prof = cenario.nome_profissional(vago.profissional_id)
    texto = (
        f"Oi, {cliente.primeiro_nome}! Abriu um horário {_dia(cenario, vago)} às {vago.hora} com a {prof}. "
        f"Quer antecipar o seu? "
    )
    if not c.mesma_profissional:
        texto += f"Seria com a {prof}, não com a {cenario.nome_profissional(cliente.profissional_preferida)}. "
    texto += f"Se preferir, pode manter o seu horário de {_dia(cenario, dela)} às {dela.hora}, sem problema nenhum."
    return texto


def _dia(cenario: Cenario, slot: Slot) -> str:
    """"hoje", "amanhã" ou "sexta (30/10)", contando a partir do 'agora' do cenário."""
    dias = (slot.inicio.date() - cenario.agora.date()).days
    if dias == 0:
        return "hoje"
    if dias == 1:
        return "amanhã"
    return f"{DIAS[slot.inicio.weekday()]} ({slot.inicio:%d/%m})"
