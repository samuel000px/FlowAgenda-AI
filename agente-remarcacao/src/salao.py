"""Informações públicas do salão, para a página inicial."""
import json
import os
import re
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

from src.dados import PASTA_DADOS, ErroDados

load_dotenv()


def carregar_salao(pasta: Path = PASTA_DADOS) -> dict:
    """Junta, nesta ordem: salao.json (exemplo, no git), salao.local.json (fora do git) e SALAO_JSON.

    SALAO_JSON serve para hospedagens como o Streamlit Cloud, onde o arquivo local não existe:
    cola-se o mesmo JSON nos segredos do site.
    """
    try:
        salao = json.loads((pasta / "salao.json").read_text(encoding="utf-8"))
        local = pasta / "salao.local.json"
        if local.exists():
            salao.update(json.loads(local.read_text(encoding="utf-8")))
        if os.getenv("SALAO_JSON"):
            salao.update(json.loads(os.environ["SALAO_JSON"]))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        raise ErroDados(f"Não deu para ler os dados do salão: {e}") from e
    if not re.fullmatch(r"\d{12,13}", salao.get("whatsapp", "")):
        raise ErroDados("whatsapp do salão precisa ter só números, com país e DDD (ex.: 5583912345678).")
    return salao


def servicos_por_grupo(salao: dict) -> dict[str, list[dict]]:
    """{"Unhas": [...], "Beleza": [...]}, na ordem em que aparecem. Sem grupo, vai para "Serviços"."""
    grupos: dict[str, list[dict]] = {}
    for s in salao.get("servicos", []):
        grupos.setdefault(s.get("grupo") or "Serviços", []).append(s)
    return grupos


def link_whatsapp(numero: str, texto: str = "") -> str:
    """Link que abre a conversa no WhatsApp com o texto já escrito."""
    digitos = re.sub(r"\D", "", numero)
    return f"https://wa.me/{digitos}" + (f"?text={quote(texto)}" if texto else "")


def link_mapa(salao: dict) -> str:
    """Abre o endereço no Google Maps."""
    return "https://www.google.com/maps/search/?api=1&query=" + quote(f"{salao['endereco']}, {salao['bairro_cidade']}")


def cartoes_da_pagina(salao: dict) -> list[dict]:
    """Os cartões em pilha da página pública, cada um com o "endereco" já pronto.

    Vêm de "links" nos dados do salão; sem eles, ficam agendar, localização, Instagram e a lista de
    serviços. Cartão sem "link" abre o WhatsApp do salão com a "mensagem" dele (vazia: sem texto).
    """
    itens = salao.get("links") or [
        {"icone": "calendar", "titulo": "Agendar Horário", "subtitulo": "Reserve seu momento especial"},
        {"icone": "map-pin", "titulo": "Localização", "subtitulo": "Como chegar", "link": link_mapa(salao)},
        *([{"icone": "instagram", "titulo": "Instagram", "subtitulo": f"@{salao['instagram']}",
            "link": f"https://www.instagram.com/{salao['instagram']}/"}] if salao.get("instagram") else []),
        {"icone": "list-checks", "titulo": "Todos os Serviços", "subtitulo": "Veja nossa lista completa", "link": "#servicos"},
    ]
    return [
        {**item, "endereco": item.get("link") or link_whatsapp(salao["whatsapp"], item.get("mensagem", salao["mensagem_whatsapp"]))}
        for item in itens
    ]
