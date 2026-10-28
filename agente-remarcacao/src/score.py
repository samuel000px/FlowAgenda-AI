"""Contas do agente. Tudo aqui é código; o modelo só recebe os resultados."""
from src.modelos import Buraco, Cliente


def taxa_falta(faltas: int, consultas: int) -> float:
    """Chance de faltar, suavizada para não chamar de 100% faltosa quem faltou 1 vez em 1."""
    # Somar 1 em cima e 4 embaixo é como começar todo mundo com 1 falta em 4 consultas (25%).
    return (faltas + 1) / (consultas + 4)


def prob_aceitar(aceitas: int, propostas: int, disposicao: int = 5) -> float:
    """Chance de aceitar antecipar. Sem histórico, vale a nota que a cliente deu (0 a 10)."""
    # A nota pesa como 2 propostas imaginárias; conforme chegam propostas reais, o histórico manda.
    # Com nota 5 a conta fica igual à suavização do plano: (aceitas + 1) / (propostas + 2).
    return (aceitas + 2 * disposicao / 10) / (propostas + 2)


def dificuldade_de_preencher(antecedencia_h: float, fila: int, ocupacao_pct: float = 100) -> float:
    """De 0 (fácil) a 1 (difícil). Mais aviso e mais fila deixam o horário mais fácil de ocupar."""
    # Pesos chutados, sem dados reais: 48h de aviso ou 3 pessoas na fila já contam como "cheio".
    # O aviso só ajuda se houver procura: num dia com a agenda vazia, um horário a mais livre continua
    # vazio, por mais aviso que tenha. A partir de 80% de ocupação, consideramos procura normal. (D22)
    procura = min(max(ocupacao_pct, 0) / 80, 1)
    facilidade = 0.6 * min(max(antecedencia_h, 0) / 48, 1) * procura + 0.4 * min(fila / 3, 1)
    return 1 - facilidade


# Quem marcou tarde havendo horário antes entra com esta nota, a não ser que tenha dito 8 ou mais. (D23)
NOTA_DE_QUEM_ESCOLHEU_TARDE = 2
NOTA_QUE_VALE_MESMO_ASSIM = 8


def disposicao_efetiva(cliente: Cliente, escolheu_tarde: bool) -> int:
    """A nota da cliente, rebaixada se ela escolheu o horário atual mesmo havendo opções antes."""
    if escolheu_tarde and cliente.disposicao < NOTA_QUE_VALE_MESMO_ASSIM:
        return min(cliente.disposicao, NOTA_DE_QUEM_ESCOLHEU_TARDE)
    return cliente.disposicao


def ganho_e_risco(
    cliente: Cliente, buraco_atual: Buraco, buraco_novo: Buraco, escolheu_tarde: bool = False
) -> tuple[float, float]:
    """Quanto se espera ganhar no horário vago e quanto se arrisca perder no horário que ela deixa."""
    nota = disposicao_efetiva(cliente, escolheu_tarde)
    p_aceitar = prob_aceitar(cliente.propostas_aceitas, cliente.propostas_recebidas, nota)
    p_falta = taxa_falta(cliente.faltas, cliente.consultas_total)
    dif_atual = dificuldade_de_preencher(buraco_atual.antecedencia_h, buraco_atual.fila, buraco_atual.ocupacao_pct)
    dif_novo = dificuldade_de_preencher(buraco_novo.antecedencia_h, buraco_novo.fila, buraco_novo.ocupacao_pct)
    # Se ela recusar, nada muda. Se aceitar:
    # - o horário vago deixa de ter a chance dif_atual de ficar vazio e passa a ter só a chance de ela faltar;
    # - o horário dela vira um buraco novo, com a chance dif_novo de ficar vazio.
    # Ver DECISIONS.md, D12.
    ganho = p_aceitar * buraco_atual.valor * (dif_atual - p_falta)
    risco = p_aceitar * buraco_novo.valor * dif_novo
    return ganho, risco


def valor_esperado(cliente: Cliente, buraco_atual: Buraco, buraco_novo: Buraco, escolheu_tarde: bool = False) -> float:
    """Ganho menos risco, em reais. Só compensa mexer quando dá mais que zero."""
    ganho, risco = ganho_e_risco(cliente, buraco_atual, buraco_novo, escolheu_tarde)
    return ganho - risco
