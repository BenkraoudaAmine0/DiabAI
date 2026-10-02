"""Gemini client — ONE model, no fallback (project requirement).

GEMINI_MODEL (default gemini-3.5-flash-lite) powers the chatbot, the clinical
interpretation of predictions and — being multimodal — reading images inside
knowledge-base uploads. Embeddings use GEMINI_EMBEDDING_MODEL through
LangChain (rag_service.get_embeddings), stored in pgvector as vector(768).
"""

from functools import lru_cache
from typing import Optional

from app.config import get_settings
from app.services.usage_service import log_usage


class GeminiNotConfigured(RuntimeError):
    def __init__(self):
        super().__init__(
            "Gemini is not configured. Set GEMINI_API_KEY in backend/.env "
            "(get one at https://aistudio.google.com/apikey)."
        )


@lru_cache
def _client():
    s = get_settings()
    if not s.gemini_api_key:
        raise GeminiNotConfigured()
    from google import genai

    return genai.Client(api_key=s.gemini_api_key)


@lru_cache
def chat_model(temperature: float = 0.3, max_tokens: int = 2048):
    """LangChain chat model on GEMINI_MODEL, for LCEL chains / LangGraph.
    max_tokens leaves room for models that think before answering (thinking
    tokens count against the output limit)."""
    s = get_settings()
    if not s.gemini_api_key:
        raise GeminiNotConfigured()
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=s.gemini_model,
        google_api_key=s.gemini_api_key,
        temperature=temperature,
        max_output_tokens=max_tokens,
    )


def read_image(
    image: bytes,
    prompt: str,
    *,
    mime_type: str = "image/png",
    user_id: Optional[str] = None,
    detail: Optional[dict] = None,
) -> str:
    """One multimodal call: `prompt` about `image` → text. Logged in
    gemini_usage like every other generation."""
    s = get_settings()
    from google.genai import types

    resp = _client().models.generate_content(
        model=s.gemini_model,
        contents=[types.Part.from_bytes(data=image, mime_type=mime_type), prompt],
        config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=2048),
    )
    usage = resp.usage_metadata
    log_usage(
        user_id,
        "generate",
        s.gemini_model,
        int(getattr(usage, "prompt_token_count", 0) or 0),
        int(getattr(usage, "candidates_token_count", 0) or 0),
        detail,
    )
    return (resp.text or "").strip()
