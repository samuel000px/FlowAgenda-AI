"""Informações públicas do salão, para a página inicial."""
import json
import re
from pathlib import Path
from urllib.parse import quote

from src.dados import PASTA_DADOS, ErroDados


def carregar_salao(pasta: Path = PASTA_DADOS) -> dict:
    """salao.json (exemplo, no git) com os campos de salao.local.json (dados reais, fora do git) por cima."""
    try:
        salao = json.loads((pasta / "salao.json").read_text(encoding="utf-8"))
        local = pasta / "salao.local.json"
        if local.exists():
            salao.update(json.loads(local.read_text(encoding="utf-8")))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        raise ErroDados(f"Não deu para ler os dados do salão: {e}") from e
    if not re.fullmatch(r"\d{12,13}", salao.get("whatsapp", "")):
        raise ErroDados("whatsapp do salão precisa ter só números, com país e DDD (ex.: 5511912345678).")
    return salao


def link_whatsapp(numero: str, texto: str = "") -> str:
    """Link que abre a conversa no WhatsApp com o texto já escrito."""
    digitos = re.sub(r"\D", "", numero)
    return f"https://wa.me/{digitos}" + (f"?text={quote(texto)}" if texto else "")
