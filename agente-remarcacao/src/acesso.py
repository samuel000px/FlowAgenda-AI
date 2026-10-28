"""Senha de entrada da interface, para quando o app estiver na internet."""
import hmac
import os

from dotenv import load_dotenv

load_dotenv()


def senha_configurada() -> str:
    """A senha vem de APP_SENHA (no .env ou nos segredos da hospedagem). Vazia = sem senha."""
    return os.getenv("APP_SENHA", "").strip()


def senha_confere(digitada: str, senha: str | None = None) -> bool:
    """Compara sem vazar pelo tempo de resposta quantos caracteres estavam certos."""
    senha = senha_configurada() if senha is None else senha
    if not senha:
        return True  # sem senha configurada: uso local, no próprio computador
    return hmac.compare_digest(digitada.encode("utf-8"), senha.encode("utf-8"))
