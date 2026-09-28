"""Gemini usage & cost tracking — powers the admin dashboard.

Every LLM generation logs one row into `gemini_usage` (migration 0002) with
token counts reported by the model and a cost estimate from the configurable
per-MTok prices in config. Embeddings (which report no token counts through
the API) are logged with a character count in `detail`.

Logging is best-effort: it must never break the chat.
"""

from typing import Any, Optional

from langchain_core.callbacks import BaseCallbackHandler

from app.config import get_settings
from app.services.supabase_client import get_service_client


def _estimate_cost(kind: str, input_tokens: int, output_tokens: int) -> float:
    s = get_settings()
    if kind == "embedding":
        return input_tokens / 1e6 * s.gemini_embedding_price_per_mtok
    return input_tokens / 1e6 * s.gemini_input_price_per_mtok + output_tokens / 1e6 * s.gemini_output_price_per_mtok


def log_usage(
    user_id: Optional[str],
    kind: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    detail: Optional[dict] = None,
) -> None:
    try:
        get_service_client().table("gemini_usage").insert(
            {
                "user_id": user_id,
                "kind": kind,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost_usd": round(_estimate_cost(kind, input_tokens, output_tokens), 8),
                "detail": detail,
            }
        ).execute()
    except Exception:
        pass  # usage tracking is advisory, never critical


class GeminiUsageCallback(BaseCallbackHandler):
    """LangChain callback: captures token usage from on_llm_end and writes one
    gemini_usage row per generation."""

    def __init__(self, user_id: Optional[str] = None, model: str = ""):
        self.user_id = user_id
        self.model = model or get_settings().gemini_model

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        try:
            usage = (getattr(response, "llm_output", None) or {}).get("token_usage") or {}
            input_tokens = int(
                usage.get("prompt_tokens") or usage.get("prompt_token_count") or 0
            )
            output_tokens = int(
                usage.get("completion_tokens") or usage.get("candidates_token_count") or 0
            )
            log_usage(self.user_id, "generate", self.model, input_tokens, output_tokens)
        except Exception:
            pass
