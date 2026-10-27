"""Contas do agente. Tudo aqui é código; o modelo só recebe os resultados."""
from src.modelos import Buraco, Cliente


def taxa_falta(faltas: int, consultas: int) -> float:
    """Chance de faltar, suavizada para não chamar de 100% faltosa quem faltou 1 vez em 1."""
    # Somar 1 em cima e 4 embaixo é como começar todo mundo com 1 falta em 4 consultas (25%).
    return (faltas + 1) / (consultas + 4)


def prob_aceitar(aceitas: int, propostas: int) -> float:
    """Chance de aceitar antecipar. Quem nunca recebeu proposta começa em 50%."""
    return (aceitas + 1) / (propostas + 2)


def dificuldade_de_preencher(antecedencia_h: float, fila: int) -> float:
    """De 0 (fácil) a 1 (difícil). Mais aviso e mais fila deixam o horário mais fácil de ocupar."""
    # Pesos chutados, sem dados reais: 48h de aviso ou 3 pessoas na fila já contam como "cheio".
    facilidade = 0.6 * min(max(antecedencia_h, 0) / 48, 1) + 0.4 * min(fila / 3, 1)
    return 1 - facilidade


def ganho_e_risco(cliente: Cliente, buraco_atual: Buraco, buraco_novo: Buraco) -> tuple[float, float]:
    """Quanto se espera ganhar no horário vago e quanto se arrisca perder no horário que ela deixa."""
    p_aceitar = prob_aceitar(cliente.propostas_aceitas, cliente.propostas_recebidas)
    p_falta = taxa_falta(cliente.faltas, cliente.consultas_total)
    dif_atual = dificuldade_de_preencher(buraco_atual.antecedencia_h, buraco_atual.fila)
    dif_novo = dificuldade_de_preencher(buraco_novo.antecedencia_h, buraco_novo.fila)
    # Se ela recusar, nada muda. Se aceitar:
    # - o horário vago deixa de ter a chance dif_atual de ficar vazio e passa a ter só a chance de ela faltar;
    # - o horário dela vira um buraco novo, com a chance dif_novo de ficar vazio.
    # Ver DECISIONS.md, D12.
    ganho = p_aceitar * buraco_atual.valor * (dif_atual - p_falta)
    risco = p_aceitar * buraco_novo.valor * dif_novo
    return ganho, risco


def valor_esperado(cliente: Cliente, buraco_atual: Buraco, buraco_novo: Buraco) -> float:
    """Ganho menos risco, em reais. Só compensa mexer quando dá mais que zero."""
    ganho, risco = ganho_e_risco(cliente, buraco_atual, buraco_novo)
    return ganho - risco
