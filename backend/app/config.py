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

    # USD per million tokens — adjust to your actual Google AI pricing
    gemini_input_price_per_mtok: float = 0.10
    gemini_output_price_per_mtok: float = 0.40
    gemini_embedding_price_per_mtok: float = 0.15

    # App
    cors_origins: str = "http://localhost:3000"
    signed_url_ttl: int = 60 * 60 * 24  # 24h

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
