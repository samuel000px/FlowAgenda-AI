"""Fase 1: confere se a chave funciona e se o modelo chama uma ferramenta."""
from rich.console import Console

from src.llm import ErroLLM, Ferramenta, rodar_com_ferramentas

console = Console()


def ver_horario_livre() -> dict:
    """Horário fixo, só para o teste."""
    return {"data": "28/10/2026", "hora": "14:00", "duracao_min": 45}


HORARIO_LIVRE = Ferramenta(
    nome="ver_horario_livre",
    descricao="Mostra qual horário da agenda ficou livre por cancelamento.",
    parametros={"type": "object", "properties": {}},
    funcao=ver_horario_livre,
)


def main() -> None:
    """Faz uma pergunta que só dá para responder usando a ferramenta."""
    try:
        resultado = rodar_com_ferramentas(
            sistema="Você é o assistente de agenda de uma esmalteria. Use as ferramentas para responder.",
            pedido="Qual horário ficou livre? Responda em uma frase.",
            ferramentas=[HORARIO_LIVRE],
        )
    except ErroLLM as e:
        console.print(f"[red]Não rodou:[/red] {e}")
        raise SystemExit(1) from None

    for passo in resultado.log:
        console.print(passo)
    if any(p["tipo"] == "ferramenta" for p in resultado.log):
        console.print("[green]OK: o modelo chamou a ferramenta e respondeu.[/green]")
    else:
        console.print("[yellow]O modelo respondeu sem usar a ferramenta.[/yellow]")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
