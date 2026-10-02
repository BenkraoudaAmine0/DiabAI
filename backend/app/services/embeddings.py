"""The knowledge base's embedding model — one model for documents AND questions.

EMBEDDING_PROVIDER=local (default)
    LOCAL_EMBEDDING_MODEL (google/embeddinggemma-300m) run on this machine by
    fastembed (ONNX, CPU — no PyTorch). Free, no rate limits, works offline
    once downloaded (~1.2 GB, first use only, into LOCAL_EMBEDDING_DIR).
    768 dimensions, multilingual (French / English), reads 2 048 tokens.
    About 5 chunks/s on a laptop CPU: a 1 100-page book ≈ 4 000 chunks ≈ 15 min.
EMBEDDING_PROVIDER=gemini
    GEMINI_EMBEDDING_MODEL (gemini-embedding-001) through the Gemini API. The
    free tier allows ~1 000 requests/day and 30 000 tokens/min, so a large book
    can take days; the paid tier costs ≈ $0.15 per million tokens.

Vectors of two different models live in different spaces: a question embedded
by one model can't find documents embedded by another. Every document records
the model that embedded it (kb_documents.embedding_model, migration 0009) and
the chatbot only searches documents of the current model — after switching
provider, re-index the other documents from the admin dashboard.
"""

import os
import threading
from pathlib import Path
from typing import Optional

from langchain_core.embeddings import Embeddings

from app.config import get_settings

BACKEND = Path(__file__).resolve().parents[2]

# (query prefix, document prefix) recommended by each model's authors
PREFIXES = {
    "google/embeddinggemma-300m": ("task: search result | query: ", "title: none | text: "),
    "intfloat/multilingual-e5-large": ("query: ", "passage: "),
}


class LocalEmbeddings(Embeddings):
    """LangChain Embeddings around a fastembed (ONNX) model."""

    def __init__(self, model_name: str, cache_dir: str, dimensions: int):
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")  # Windows log noise
        from fastembed import TextEmbedding

        self.model_name = model_name
        self._model = TextEmbedding(model_name, cache_dir=cache_dir)
        self._query_prefix, self._doc_prefix = PREFIXES.get(model_name, ("", ""))
        size = len(self.embed_query("test"))
        if size != dimensions:
            raise RuntimeError(
                f"{model_name} makes {size}-d vectors but kb_chunks stores "
                f"{dimensions}-d (EMBEDDING_DIMENSIONS): pick a {dimensions}-d model"
            )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [
            v.tolist()
            for v in self._model.embed([self._doc_prefix + t for t in texts], batch_size=16)
        ]

    def embed_query(self, text: str) -> list[float]:
        return next(iter(self._model.embed([self._query_prefix + text]))).tolist()


def model_id() -> str:
    """What kb_documents.embedding_model records, e.g.
    'local:google/embeddinggemma-300m' or 'gemini:gemini-embedding-001'."""
    s = get_settings()
    if s.embedding_provider == "gemini":
        return f"gemini:{s.gemini_embedding_model}"
    return f"local:{s.local_embedding_model}"


def is_local() -> bool:
    return get_settings().embedding_provider != "gemini"


_lock = threading.Lock()
_instance: Optional[Embeddings] = None


def get_embeddings() -> Embeddings:
    """The shared embedding model, created once (the local one takes seconds
    to load and ~1.5 GB of RAM — never twice, even under concurrent calls)."""
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                _instance = _create()
    return _instance


def _create() -> Embeddings:
    s = get_settings()
    if s.embedding_provider not in ("local", "gemini"):
        raise RuntimeError(
            f"EMBEDDING_PROVIDER must be 'local' or 'gemini', not '{s.embedding_provider}'"
        )
    if is_local():
        cache = Path(s.local_embedding_dir)
        if not cache.is_absolute():
            cache = BACKEND / cache
        return LocalEmbeddings(s.local_embedding_model, str(cache), s.embedding_dimensions)

    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    from app.services.gemini_service import GeminiNotConfigured

    if not s.gemini_api_key:
        raise GeminiNotConfigured()
    # output_dimensionality must match kb_chunks.embedding vector(768)
    return GoogleGenerativeAIEmbeddings(
        model=s.gemini_embedding_model,
        google_api_key=s.gemini_api_key,
        output_dimensionality=s.embedding_dimensions,
    )
