"""Gemini client — ONE model, no fallback (project requirement).

GEMINI_MODEL (default gemini-3.5-flash-lite) powers the chatbot generation;
embeddings use GEMINI_EMBEDDING_MODEL (Flash Lite is a generation model and
cannot embed), stored in Supabase pgvector as vector(768).
"""

from functools import lru_cache

from app.config import get_settings


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


def generate(system_prompt: str, user_prompt: str) -> str:
    s = get_settings()
    from google.genai import types

    resp = _client().models.generate_content(
        model=s.gemini_model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.3,
            max_output_tokens=1024,
        ),
    )
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError(f"Gemini ({s.gemini_model}) returned an empty response")
    return text


def embed_text(text: str) -> list[float]:
    """768-dim embedding (vector(768) in pgvector)."""
    s = get_settings()
    from google.genai import types

    resp = _client().models.embed_content(
        model=s.gemini_embedding_model,
        contents=text[:8000],
        config=types.EmbedContentConfig(output_dimensionality=s.embedding_dimensions),
    )
    values = resp.embeddings[0].values
    if len(values) != s.embedding_dimensions:
        raise RuntimeError(
            f"Embedding dimension mismatch: got {len(values)}, "
            f"expected {s.embedding_dimensions}"
        )
    return list(values)
