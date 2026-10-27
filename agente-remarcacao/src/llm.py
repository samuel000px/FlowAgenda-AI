"""Único lugar do projeto que conversa com o Gemini."""
# Se um dia voltarmos para o Claude, só este arquivo muda (ver DECISIONS.md, D3).
import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

load_dotenv()

# O modelo também gasta tokens "pensando"; com 1024 a resposta às vezes vinha cortada.
MAX_TOKENS = 4096
# 20 s é o mesmo limite do Encaixa (Samuel Almeida): a demo não pode ficar travada esperando.
TIMEOUT_MS = 20_000
MAX_PASSOS = 8


@dataclass
class Ferramenta:
    """Uma função Python que o modelo pode pedir para rodar."""

    nome: str
    descricao: str  # o modelo decide quando usar a ferramenta lendo isto
    parametros: dict[str, Any]  # JSON Schema dos argumentos
    funcao: Callable[..., dict[str, Any]]


@dataclass
class Resultado:
    """Texto final do modelo e o registro de cada passo."""

    texto: str
    log: list[dict[str, Any]] = field(default_factory=list)


class ErroLLM(Exception):
    """Falha ao falar com o modelo, já com uma mensagem legível."""


class ErroFormato(ErroLLM):
    """O modelo respondeu, mas fora do formato combinado. Vale tentar de novo uma vez."""


def _cliente() -> genai.Client:
    """Cria o cliente com a chave do .env."""
    chave = os.getenv("GEMINI_API_KEY")
    if not chave:
        raise ErroLLM("GEMINI_API_KEY não encontrada. Copie .env.example para .env e coloque a chave.")
    # A camada gratuita limita chamadas por minuto (erro 429). Em vez de parar, esperamos e
    # tentamos de novo: 10 s, 20 s, 40 s.
    tentativas = types.HttpRetryOptions(attempts=4, initial_delay=10, max_delay=60, http_status_codes=[429, 500, 503])
    return genai.Client(api_key=chave, http_options=types.HttpOptions(timeout=TIMEOUT_MS, retry_options=tentativas))


def _modelo() -> str:
    """Nome do modelo, configurável no .env."""
    return os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite"


def rodar_com_ferramentas(
    sistema: str, pedido: str, ferramentas: list[Ferramenta], max_passos: int = MAX_PASSOS
) -> Resultado:
    """Laço de function calling: o modelo pede, o código executa, o resultado volta ao modelo."""
    cliente = _cliente()
    por_nome = {f.nome: f for f in ferramentas}
    config = types.GenerateContentConfig(
        system_instruction=sistema,
        max_output_tokens=MAX_TOKENS,
        tools=[
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name=f.nome, description=f.descricao, parameters_json_schema=f.parametros
                    )
                    for f in ferramentas
                ]
            )
        ],
        # O SDK sabe rodar o laço sozinho, mas desligamos: queremos registrar cada passo
        # e garantir o limite de voltas no nosso código.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    conversa = [types.Content(role="user", parts=[types.Part.from_text(text=pedido)])]
    log: list[dict[str, Any]] = []

    for passo in range(1, max_passos + 1):
        resposta = _gerar(cliente, conversa, config)
        chamadas = resposta.function_calls or []
        if not chamadas:
            texto = resposta.text or ""
            log.append({"passo": passo, "tipo": "resposta_final", "texto": texto, "tokens": _tokens(resposta)})
            return Resultado(texto=texto, log=log)

        # Guardamos o pedido do modelo e respondemos com o resultado de cada ferramenta.
        conversa.append(resposta.candidates[0].content)
        partes = []
        for chamada in chamadas:
            args = dict(chamada.args or {})
            saida = _executar(por_nome, chamada.name, args)
            log.append({"passo": passo, "tipo": "ferramenta", "nome": chamada.name, "args": args, "resultado": saida})
            partes.append(types.Part.from_function_response(name=chamada.name, response=saida))
        conversa.append(types.Content(role="user", parts=partes))

    raise ErroLLM(f"O modelo passou de {max_passos} passos sem terminar.")


def gerar_json(sistema: str, pedido: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Uma chamada sem ferramentas que precisa voltar em JSON. Devolve (dados, registro do passo)."""
    config = types.GenerateContentConfig(
        system_instruction=sistema,
        max_output_tokens=MAX_TOKENS,
        response_mime_type="application/json",
    )
    resposta = _gerar(_cliente(), pedido, config)
    texto = resposta.text or ""
    return extrair_json(texto), {"tipo": "json", "texto": texto, "tokens": _tokens(resposta)}


def extrair_json(texto: str) -> dict[str, Any]:
    """Tira as cercas de markdown (```json) e lê o objeto JSON da resposta."""
    limpo = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto.strip())
    inicio, fim = limpo.find("{"), limpo.rfind("}")
    if inicio == -1 or fim == -1:
        raise ErroFormato(f"O modelo não devolveu JSON: {texto[:200]!r}")
    try:
        dados = json.loads(limpo[inicio : fim + 1])
    except json.JSONDecodeError as e:
        raise ErroFormato(f"JSON inválido na resposta do modelo: {e}") from e
    if not isinstance(dados, dict):
        raise ErroFormato("O modelo devolveu JSON, mas não um objeto.")
    return dados


def _tokens(resposta) -> int | None:
    """Total de tokens da chamada, para acompanhar o gasto da cota."""
    uso = resposta.usage_metadata
    return uso.total_token_count if uso else None


def _gerar(cliente: genai.Client, conversa: list | str, config: types.GenerateContentConfig):
    """Uma chamada ao modelo, traduzindo erros de API e de rede."""
    try:
        return cliente.models.generate_content(model=_modelo(), contents=conversa, config=config)
    except errors.APIError as e:
        if e.code == 429:
            raise ErroLLM("Limite da camada gratuita do Gemini atingido. Espere um pouco e tente de novo.") from e
        raise ErroLLM(f"O Gemini respondeu com erro {e.code}: {e.message}") from e
    except httpx.TransportError as e:
        raise ErroLLM(f"Sem resposta do Gemini em {TIMEOUT_MS // 1000} s ou falha de rede: {e}") from e


def _executar(por_nome: dict[str, Ferramenta], nome: str, args: dict[str, Any]) -> dict[str, Any]:
    """Roda a ferramenta pedida; se der erro, devolve o erro como texto para o modelo."""
    ferramenta = por_nome.get(nome)
    if ferramenta is None:
        return {"erro": f"A ferramenta '{nome}' não existe."}
    try:
        return ferramenta.funcao(**args)
    except Exception as e:  # o modelo lê o erro e pode corrigir os argumentos; o laço não cai
        return {"erro": f"{type(e).__name__}: {e}"}
