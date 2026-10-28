"""Situações montadas para testar a escolha do agente. Cada uma diz quais escolhas são aceitáveis.

Todas: agora é quarta 28/10 às 09:00 e o horário livre é hoje às 14:00 (5h de aviso, dia sem fila).
"""
from dataclasses import dataclass
from datetime import datetime

from src.modelos import Cenario, Cliente, Dia, Slot

AGORA = datetime(2026, 10, 28, 9, 0)
PROFISSIONAIS = {"P1": "Lia", "P2": "Nina", "P3": "Rafa"}
# Ocupação de 80% ou mais em todos os dias: a procura é normal e quem decide são o aviso, a fila e a
# cliente. Os casos de agenda com folga estão em cenarios.json (S8) e nos testes da conta.
DIAS = {
    "2026-10-28": Dia(85, 0),
    "2026-10-29": Dia(80, 0),
    "2026-10-30": Dia(85, 1),
    "2026-11-02": Dia(95, 3),
    "2026-11-03": Dia(95, 3),
}
# onde a candidata está marcada; quanto mais longe e com fila, mais fácil preencher o horário que ela deixa
LONGE = ("2026-11-02", "10:00")
LONGE_2 = ("2026-11-03", "10:00")
SEXTA = ("2026-10-30", "10:00")
AMANHA = ("2026-10-29", "10:00")
AMANHA_CEDO = ("2026-10-29", "07:00")


@dataclass
class CasoDecisao:
    """Uma situação e as respostas aceitas (None = decidir não mexer)."""

    id: str
    titulo: str
    o_que_mede: str
    cenario: Cenario
    aceitas: set


def cliente(cid, nome, visitas, faltas, propostas, aceitas, nota=5, prefere=None) -> Cliente:
    return Cliente(cid, nome, "manicure", 45, visitas, faltas, propostas, aceitas, nota, prefere)


def montar(caso_id: str, candidatas: list[tuple[Cliente, tuple[str, str], str]], prof_vago: str = "P2") -> Cenario:
    """Cenário com o horário das 14:00 já livre e cada candidata no seu horário."""
    agenda = [Slot("V", "2026-10-28", "14:00", 45, "manicure", "livre", None, 45, prof_vago)]
    for i, (c, (data, hora), prof) in enumerate(candidatas, start=1):
        agenda.append(Slot(f"{caso_id}-{i}", data, hora, 45, "manicure", "ocupado", c.id, 45, prof))
    clientes = {c.id: c for c, _, _ in candidatas}
    return Cenario(caso_id, caso_id, "", AGORA, "V", clientes, agenda, DIAS, {}, {}, PROFISSIONAIS)


def casos() -> list[CasoDecisao]:
    """As sete situações."""
    ana, bruna = cliente("A", "Ana Prado", 12, 0, 4, 3), cliente("B", "Bruna Teles", 6, 2, 3, 0)
    paula, renata = cliente("C", "Paula Moura", 8, 1, 3, 2), cliente("D", "Renata Viana", 8, 1, 3, 2)
    elis = cliente("E", "Elis Campos", 8, 0, 4, 0, nota=10)  # diz que adora antecipar, mas recusou 4 de 4
    fabi = cliente("F", "Fabi Rangel", 8, 0, 4, 3, nota=3)
    gal = cliente("G", "Gal Pereira", 10, 0, 3, 2, prefere="P1")  # prefere a Lia; o horário é com a Nina
    hel = cliente("H", "Helô Sampaio", 6, 1, 2, 1)
    sofia, talita = cliente("I", "Sofia Leme", 12, 0, 4, 3), cliente("J", "Talita Reis", 8, 0, 3, 2)
    vera, wanda = cliente("K", "Vera Lins", 8, 1, 2, 1), cliente("L", "Wanda Couto", 6, 1, 3, 1)
    yara = cliente("M", "Yara Brito", 6, 2, 1, 0)
    nova = cliente("N", "Lara Costa", 1, 1, 0, 0, nota=8)  # nova: faltou na única vez, mas disse nota 8
    veterana = cliente("O", "Olga Sousa", 20, 2, 6, 3)
    return [
        CasoDecisao("D1", "Vencedora clara", "escolhe a do topo quando a diferença é grande",
                    montar("D1", [(ana, LONGE, "P1"), (bruna, SEXTA, "P3")]), {"A"}),
        CasoDecisao("D2", "Empate exato", "lida com empate e é consistente entre rodadas",
                    montar("D2", [(paula, LONGE, "P1"), (renata, LONGE_2, "P3")]), {"C", "D"}),
        CasoDecisao("D3", "Nota alta, histórico ruim", "não se deixa levar pela nota 10 quando o histórico diz o contrário",
                    montar("D3", [(elis, LONGE, "P1"), (fabi, LONGE_2, "P3")]), {"F"}),
        CasoDecisao("D4", "Só sobra quem prefere outra", "escolhe e avisa na mensagem que é com a Nina",
                    montar("D4", [(gal, LONGE, "P1")]), {"G"}),
        CasoDecisao("D5", "Margem mínima", "com valor esperado quase zero, mexer ou não são ambos aceitáveis",
                    montar("D5", [(hel, AMANHA_CEDO, "P1")]), {"H", None}),
        CasoDecisao("D6", "Muitas candidatas", "acha a melhor entre cinco",
                    montar("D6", [(wanda, AMANHA, "P1"), (yara, LONGE, "P3"), (talita, SEXTA, "P1"),
                                  (vera, LONGE_2, "P3"), (sofia, LONGE, "P1")]), {"I"}),
        CasoDecisao("D7", "Nova animada contra veterana", "quase empate: a nova tem nota 8, a veterana tem histórico",
                    montar("D7", [(nova, LONGE, "P1"), (veterana, LONGE_2, "P3")]), {"N", "O"}),
        *casos_mais_dificeis(),
    ]


def casos_mais_dificeis() -> list[CasoDecisao]:
    """Segunda leva: diferenças pequenas e números que enganam à primeira vista."""
    # D8: três quase empatadas (diferença menor que R$ 0,60)
    t1, t2, t3 = cliente("T1", "Carol Dias", 10, 1, 3, 2), cliente("T2", "Duda Rios", 9, 1, 3, 2), cliente("T3", "Iris Lobo", 11, 1, 3, 2)
    # D9: todas compensam muito pouco (menos de R$ 1,10)
    b1, b2, b3 = cliente("B1", "Jade Neri", 6, 1, 2, 1), cliente("B2", "Kátia Luz", 7, 1, 2, 1), cliente("B3", "Mel Assis", 8, 1, 2, 1)
    # D10: nota 10 e nunca recebeu proposta (chance de aceitar 100%), mas falta metade das vezes
    faltosa, firme = cliente("X", "Rita Paz", 8, 5, 0, 0, nota=10), cliente("Y", "Sara Leal", 12, 0, 4, 3)
    # D11: a mais confiável está marcada para amanhã cedo, sem fila: puxá-la abre um buraco difícil
    confiavel, mediana = cliente("Z", "Teca Moura", 12, 0, 4, 3), cliente("W", "Ully Bento", 6, 1, 2, 1)
    # D12: oito candidatas, a melhor no meio da lista da agenda
    oito = [
        (cliente("O1", "Ana Ruiz", 6, 2, 3, 0), AMANHA, "P1"),
        (cliente("O2", "Bel Frota", 8, 1, 3, 1), SEXTA, "P3"),
        (cliente("O3", "Cris Lago", 10, 1, 2, 1), LONGE, "P1"),
        (cliente("O4", "Dani Sá", 15, 0, 5, 4), LONGE_2, "P3"),
        (cliente("O5", "Edu Vaz", 5, 1, 1, 0), LONGE, "P3"),
        (cliente("O6", "Fê Rocha", 9, 2, 4, 2), SEXTA, "P1"),
        (cliente("O7", "Gabi Cruz", 7, 0, 3, 1), AMANHA, "P3"),
        (cliente("O8", "Hana Lins", 12, 3, 6, 3), LONGE_2, "P1"),
    ]
    return [
        CasoDecisao("D8", "Três quase empatadas", "escolhe uma das três e mantém a escolha entre rodadas",
                    montar("D8", [(t1, LONGE, "P1"), (t2, LONGE_2, "P3"), (t3, LONGE, "P3")]), {"T1", "T2", "T3"}),
        CasoDecisao("D9", "Todas compensam pouco", "com três opções de valor quase zero, mexer em qualquer uma ou não mexer",
                    montar("D9", [(b1, AMANHA_CEDO, "P1"), (b2, AMANHA_CEDO, "P3"), (b3, AMANHA_CEDO, "P1")]),
                    {"B1", "B2", "B3", None}),
        CasoDecisao("D10", "Nota 10 que falta muito", "não se encanta com 100% de chance de aceitar quando ela falta metade das vezes",
                    montar("D10", [(faltosa, LONGE, "P1"), (firme, LONGE_2, "P3")]), {"Y"}),
        CasoDecisao("D11", "A melhor cliente abriria um buraco ruim", "pesa o horário que a cliente deixa, não só se ela é boa",
                    montar("D11", [(confiavel, AMANHA_CEDO, "P1"), (mediana, LONGE, "P3")]), {"W"}),
        CasoDecisao("D12", "Oito candidatas", "acha a melhor numa lista longa",
                    montar("D12", oito), {"O4"}),
    ]
