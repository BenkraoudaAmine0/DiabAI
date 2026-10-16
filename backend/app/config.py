from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration. Missing keys default to empty strings
    so the app still boots (endpoints fail with clear errors only when used)."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # Gemini — single model, no fallback (by design)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768

    # Knowledge-base embeddings: "gemini" (API, 0 MB server RAM) or "local" (fastembed ONNX, ~1.5 GB RAM).
    # Questions and documents must use the same model — see app/services/embeddings.py.
    embedding_provider: str = "gemini"
    local_embedding_model: str = "google/embeddinggemma-300m"  # 768-d, multilingual

    local_embedding_dir: str = "models_app/embeddings"  # downloaded once (~1.2 GB)

    # USD per million tokens — adjust to your actual Google AI pricing
    gemini_input_price_per_mtok: float = 0.10
    gemini_output_price_per_mtok: float = 0.40
    gemini_embedding_price_per_mtok: float = 0.15

    # Knowledge base (RAG)
    # Chunks below this cosine similarity are not sent to the model. 0 keeps
    # the previous behaviour (always top-k); tune on real questions (~0.5).
    kb_min_similarity: float = 0.0
    # Admin upload limits. Supabase Storage's free plan caps files at 50 MB.
    kb_max_document_mb: int = 25
    kb_max_book_mb: int = 100
    # Tables are always extracted. Images (figures, charts, scanned pages) are
    # read by GEMINI_MODEL — one call each, capped per document so a book full
    # of pictures can't burn through the API quota. 0 disables image reading.
    kb_max_vision_calls: int = 60
    kb_min_image_px: int = 120  # skip icons, bullets and rules smaller than this

    # App
    # Public URL of the frontend: invitation emails link to
    # {frontend_url}/auth/callback?next=/set-password (allow {frontend_url}/**
    # in Supabase → Auth → URL Configuration → Redirect URLs).
    frontend_url: str = "http://localhost:3000"
    app_env: str = "development"  # shown in the admin sidebar
    cors_origins: str = "http://localhost:3000"
    signed_url_ttl: int = 60 * 60 * 24  # 24h

    # Hugging Face
    hf_token: str = ""
    hf_model_repo_id: str = "BenkraoudaAmine/diabai-models"
    hf_vision_space: str = "BenkraoudaAmine/diabai-vision"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]



@lru_cache
def get_settings() -> Settings:
    return Settings()
