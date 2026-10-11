"""Knowledge-base ingestion: file → LangChain Documents (text, tables,
figures) → chunks → embeddings (local or Gemini) → Supabase pgvector (kb_chunks).

Shared by the admin upload API (routers/kb.py, run as a FastAPI background
task) and the CLI (scripts/ingest_kb.py). File reading lives in kb_loaders:

  .pdf          PyMuPDF — text, ruled tables, images, scanned pages
  .docx         python-docx — sections, tables, pictures
  .epub         ebooklib + BeautifulSoup — chapters, tables, images
  .txt / .md    plain text

Images (figures, charts, scanned pages) are read by GEMINI_MODEL, at most
KB_MAX_VISION_CALLS per document. Tables never need the model.

Embeddings come from app/services/embeddings (local EmbeddingGemma by
default — free, no rate limits — or Gemini); the model is recorded in
kb_documents.embedding_model.

A kb_documents row goes processing → ready | failed. match_kb_chunks_v3 only
searches 'ready' documents, so a half-embedded book never shows up in answers.
"""

import re
import time
from pathlib import Path
from typing import Any, Callable, Optional

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.services import embeddings, gemini_service, kb_loaders, rag_service
from app.services.kb_loaders import IngestError, LoadedFile
from app.services.supabase_client import get_service_client
from app.services.usage_service import log_usage

import asyncio

__all__ = ["IngestError", "LoadedFile"]  # re-exported for routers/kb.py

BUCKET = "kb-docs"
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150
TABLE_CHUNK_MAX = 1800  # a table or figure stays whole up to this size
EMBED_BATCH = 50  # chunks per embedding request (Gemini accepts up to 100)
MAX_RETRIES = 6  # backoff 5, 10, 20, 40, 60 s — free-tier rate limits are tight
MIN_TEXT_CHARS = 20  # less extracted text than this = nothing to index

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".epub": "application/epub+zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
}
SUPPORTED_EXTENSIONS = tuple(MIME_TYPES)

# → kb_chunks.metadata (citations: "Title · Chapter · p. 142", table / figure)
CHUNK_META_KEYS = ("page", "page_label", "chapter", "content_type", "ocr")


# ── validation ───────────────────────────────────────────────────────────────
def check_extension(ext: str) -> None:
    if ext == ".doc":
        raise IngestError(
            "Old Word .doc files aren't supported — save it as .docx and "
            "upload it again."
        )
    if ext not in MIME_TYPES:
        raise IngestError(
            f"Unsupported file type '{ext or '?'}'. "
            f"Allowed: {', '.join(SUPPORTED_EXTENSIONS)}."
        )


def check_file(ext: str, head: bytes) -> None:
    """Reject unsupported types, and files whose first bytes don't match the
    extension (a renamed .exe is not a PDF)."""
    check_extension(ext)
    if ext == ".pdf" and b"%PDF-" not in head[:1024]:
        raise IngestError("This file is not a valid PDF.")
    if ext in (".epub", ".docx") and not head.startswith(b"PK\x03\x04"):
        raise IngestError(f"This file is not a valid {ext[1:].upper()} file.")
    is_utf16 = head.startswith((b"\xff\xfe", b"\xfe\xff"))
    if ext in (".txt", ".md") and b"\x00" in head and not is_utf16:
        raise IngestError("This doesn't look like a text file.")


# ── loading & splitting ──────────────────────────────────────────────────────
def load_file(
    path: Path, read_image: Optional[kb_loaders.ReadImage] = None
) -> LoadedFile:
    s = get_settings()
    loaded = kb_loaders.load(
        path,
        read_image=read_image,
        max_images=max(0, s.kb_max_vision_calls),
        min_image_px=s.kb_min_image_px,
    )
    if sum(len(d.page_content.strip()) for d in loaded.docs) < MIN_TEXT_CHARS:
        if path.suffix.lower() == ".pdf":
            raise IngestError(
                "No text found in this PDF — it looks like a scanned document "
                "(images only) and its pages couldn't be read: image reading "
                "is off or over its limit (KB_MAX_VISION_CALLS)."
            )
        raise IngestError("No text found in this file.")
    return loaded


def _split_table(doc: Document) -> list[Document]:
    """Long Markdown tables are cut between rows; every part repeats the
    caption and header row so it still reads as a table on its own."""
    lines = doc.page_content.split("\n")
    first = next((i for i, line in enumerate(lines) if line.startswith("|")), None)
    if first is None or len(lines) < first + 3:
        return RecursiveCharacterTextSplitter(
            chunk_size=TABLE_CHUNK_MAX, chunk_overlap=0
        ).split_documents([doc])
    head = lines[: first + 2]  # caption + header row + separator
    base = sum(len(line) + 1 for line in head)
    parts: list[list[str]] = [[]]
    size = base
    for row in lines[first + 2 :]:
        if parts[-1] and size + len(row) > TABLE_CHUNK_MAX:
            parts.append([])
            size = base
        parts[-1].append(row)
        size += len(row) + 1
    return [
        Document(page_content="\n".join(head + rows), metadata=dict(doc.metadata))
        for rows in parts
    ]


def split(docs: list[Document]) -> list[Document]:
    """Text: 900/150 recursive split, each page / chapter on its own, so a
    chunk never spans two pages and keeps an exact page citation.
    Tables and figures: kept whole up to TABLE_CHUNK_MAX, then cut between
    rows with the header repeated."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    figure_splitter = RecursiveCharacterTextSplitter(
        chunk_size=TABLE_CHUNK_MAX, chunk_overlap=CHUNK_OVERLAP
    )
    chunks: list[Document] = []
    for doc in docs:
        kind = doc.metadata.get("content_type", "text")
        if kind != "text" and len(doc.page_content) <= TABLE_CHUNK_MAX:
            chunks.append(doc)
        elif kind == "table":
            chunks.extend(_split_table(doc))
        elif kind == "figure":
            chunks.extend(figure_splitter.split_documents([doc]))
        else:
            chunks.extend(text_splitter.split_documents([doc]))
    return chunks


def usable_title(title: Optional[str]) -> Optional[str]:
    """File-embedded titles are often junk ("Microsoft Word - draft3.docx")."""
    t =" ".join((title or "").split())
    if (
        not t
        or len(t) > 200
        or t.lower().startswith("microsoft word")
        or re.search(r"\.(docx?|pdf|indd|tex|txt|md)$", t, re.IGNORECASE)
    ):
        return None
    return t


# ── ingestion job ────────────────────────────────────────────────────────────
_TRANSIENT = (
    "429",
    "resource_exhausted",
    "quota",
    "rate limit",
    "internal",
    "503",
    "unavailable",
    "deadline",
    "timeout",
    "timed out",
    "connection",
)


def _with_retry(what: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Retry rate-limit / transient Gemini + Supabase errors with backoff."""
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            transient = any(t in str(exc).lower() for t in _TRANSIENT)
            if attempt == MAX_RETRIES - 1 or not transient:
                raise
            delay = min(60, 5 * 2**attempt)
            print(f"[kb] {what}: {exc.__class__.__name__} — retrying in {delay}s")
            time.sleep(delay)


def _update(document_id: str, **fields: Any) -> None:
    get_service_client().table("kb_documents").update(fields).eq(
        "id", document_id
    ).execute()


def _remove_chunks(document_id: str) -> None:
    get_service_client().table("kb_chunks").delete().eq(
        "document_id", document_id
    ).execute()


def _image_reader(document_id: str, user_id: Optional[str]) -> kb_loaders.ReadImage:
    def read(png: bytes, prompt: str) -> str:
        return _with_retry(
            f"{document_id} image",
            gemini_service.read_image,
            png,
            prompt,
            user_id=user_id,
            detail={"purpose": "kb_image", "document_id": document_id},
        )

        time.sleep(1)

    return read


def ingest_document(
    document_id: str,
    file_path: str | Path,
    *,
    user_id: Optional[str] = None,
    store_original: bool = True,
    use_file_title: bool = False,
    use_file_author: bool = False,
    delete_file: bool = True,
) -> Optional[str]:
    """Store the original → load → split → embed → mark 'ready'.

    Runs as a FastAPI background task, so it never raises: a failure marks
    the row 'failed' with the reason. Returns that reason, or None on success.
    Safe to re-run on the same document (re-index): old chunks are removed.
    """
    path = Path(file_path)
    ext = path.suffix.lower()
    svc = get_service_client()
    storage_path = f"kb/{document_id}{ext}"
    try:
        _remove_chunks(document_id)

        if store_original:
            try:
                svc.storage.from_(BUCKET).upload(
                    storage_path,
                    path.read_bytes(),
                    {"content-type": MIME_TYPES.get(ext, "application/octet-stream"),
                     "upsert": "true"},
                )
                _update(document_id, storage_path=storage_path)
            except Exception as exc:  # e.g. over the Storage plan's file limit
                print(f"[kb] {document_id}: original not stored ({exc}) "
                      "— it can't be re-indexed later")

        loaded = load_file(path, read_image=_image_reader(document_id, user_id))
        chunks = split(loaded.docs)
        if not chunks:
            raise IngestError("No text found in this file.")
        for i, chunk in enumerate(chunks):
            chunk.metadata = {
                "document_id": document_id,
                "chunk_index": i,
                **{k: chunk.metadata.get(k) for k in CHUNK_META_KEYS},
            }

        details: dict[str, Any] = {
            "page_count": loaded.page_count,
            "chunk_count": len(chunks),
            "chunks_embedded": 0,
        }
        if use_file_title and usable_title(loaded.title):
            details["title"] = usable_title(loaded.title)
        if use_file_author and loaded.author:
            details["author"] = loaded.author.strip()[:200]
        _update(document_id, **details)
        try:  # migration 0006 column — informative only, never fatal
            _update(document_id, extraction=loaded.extraction.as_dict())
        except Exception:
            pass

        store = rag_service.get_store()
        print(f"[kb] {document_id}: embedding {len(chunks)} chunks with {embeddings.model_id()}")
        started = time.monotonic()
        for start in range(0, len(chunks), EMBED_BATCH):
            batch = chunks[start : start + EMBED_BATCH]
            _with_retry(
                f"{document_id} batch {start // EMBED_BATCH + 1}",
                store.add_texts,
                [c.page_content for c in batch],
                [c.metadata for c in batch],
            )
            done = start + len(batch)
            _update(document_id, chunks_embedded=done)
            if done % 500 < EMBED_BATCH or done == len(chunks):
                print(f"[kb] {document_id}: {done}/{len(chunks)} chunks "
                      f"({time.monotonic() - started:.0f}s)")
            if not embeddings.is_local() and done < len(chunks):
                time.sleep(1.0)  # Gentle pacing under Gemini's 30k tokens/min quota


        _update(
            document_id,
            status="ready",
            error=None,
            embedding_model=embeddings.model_id(),  # migration 0009
        )

        if not embeddings.is_local():  # the local model costs nothing
            characters = sum(len(c.page_content) for c in chunks)
            log_usage(
                user_id=user_id,
                kind="embedding",
                model=get_settings().gemini_embedding_model,
                input_tokens=characters // 4,  # API reports no counts: ~4 chars/token
                output_tokens=0,
                detail={
                    "document_id": document_id,
                    "chunks": len(chunks),
                    "characters": characters,
                    "tokens_estimated": True,
                },
            )
        return None

    except Exception as exc:
        reason = (
            str(exc)
            if isinstance(exc, IngestError)
            else f"{exc.__class__.__name__}: {exc}"
        )[:1000]
        print(f"[kb] {document_id}: ingestion failed — {reason}")
        try:
            _remove_chunks(document_id)
            _update(document_id, status="failed", error=reason)
            still_there = (
                svc.table("kb_documents").select("id").eq("id", document_id)
                .limit(1).execute().data
            )
            if not still_there and store_original:
                # the admin deleted it mid-ingestion: don't leave the file behind
                svc.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass
        return reason

    finally:
        if delete_file:
            path.unlink(missing_ok=True)


def fail_interrupted() -> int:
    """Startup hook: rows still 'processing' were cut off by a server restart
    (background tasks don't survive one). Mark them failed so the admin can
    re-index. Run with a single worker process — with several workers, one
    starting up would also flag another worker's job that is still running."""
    res = (
        get_service_client()
        .table("kb_documents")
        .update({
            "status": "failed",
            "error": "Interrupted by a server restart — re-index it.",
        })
        .eq("status", "processing")
        .execute()
    )
    return len(res.data or [])
