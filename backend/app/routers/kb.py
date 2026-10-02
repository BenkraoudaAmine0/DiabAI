"""Admin knowledge-base management — upload / list / delete / re-index.

Upload validates the file and copies it to a temp file, creates the
kb_documents row as 'processing' and returns 202 at once. Ingestion (store
original → extract text → chunk → embed) runs as a FastAPI background task
(kb_ingest_service.ingest_document); the dashboard polls the list for status
and progress (chunks_embedded / chunk_count).
"""

import hashlib
import os
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from app.auth import AuthUser, require_admin
from app.config import get_settings
from app.services import embeddings
from app.services import kb_ingest_service as kb
from app.services.supabase_client import get_service_client

router = APIRouter()

KINDS = ("document", "book")
READ_CHUNK = 1024 * 1024
HEAD_BYTES = 8192  # enough to check the file signature
COLUMNS = (
    "id, title, kind, status, error, file_name, mime_type, size_bytes, author, "
    "page_count, chunk_count, chunks_embedded, storage_path, extraction, "
    "embedding_model, created_at, "
    "uploader:profiles!kb_documents_uploaded_by_fkey(full_name)"
)


def _limits() -> dict:
    s = get_settings()
    return {"document_mb": s.kb_max_document_mb, "book_mb": s.kb_max_book_mb}


def _get(svc, document_id: str) -> dict:
    rows = (
        svc.table("kb_documents")
        .select(COLUMNS)
        .eq("id", document_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    return rows[0]


def _save_upload(
    file: UploadFile, suffix: str, max_bytes: int
) -> tuple[str, int, str, bytes]:
    """Copy the upload to a temp file (the LangChain loaders need a path),
    enforcing the size limit and hashing on the way.
    Returns (path, size, sha256, first bytes). mkstemp, not
    NamedTemporaryFile: on Windows an open NamedTemporaryFile can't be
    reopened by the loaders."""
    fd, tmp_path = tempfile.mkstemp(prefix="kb-", suffix=suffix)
    hasher = hashlib.sha256()
    size = 0
    head = b""
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := file.file.read(READ_CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File larger than {max_bytes // (1024 * 1024)} MB",
                    )
                if len(head) < HEAD_BYTES:
                    head += chunk[: HEAD_BYTES - len(head)]
                hasher.update(chunk)
                out.write(chunk)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise
    return tmp_path, size, hasher.hexdigest(), head


@router.get("/documents")
def list_documents(user: AuthUser = Depends(require_admin)) -> dict:
    rows = (
        get_service_client()
        .table("kb_documents")
        .select(COLUMNS)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )
    # documents embedded by another model aren't searched until re-indexed
    return {
        "documents": rows,
        "limits": _limits(),
        "embedding_model": embeddings.model_id(),
    }


@router.get("/documents/{document_id}")
def get_document(document_id: UUID, user: AuthUser = Depends(require_admin)) -> dict:
    return {"document": _get(get_service_client(), str(document_id))}


@router.post("/documents", status_code=202)
def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    kind: str = Form(default="document"),
    title: str | None = Form(default=None),
    author: str | None = Form(default=None),
    user: AuthUser = Depends(require_admin),
) -> dict:
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {KINDS}")

    file_name = Path(file.filename or "").name
    ext = Path(file_name).suffix.lower()
    try:
        kb.check_extension(ext)
    except kb.IngestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    s = get_settings()
    max_mb = s.kb_max_book_mb if kind == "book" else s.kb_max_document_mb
    tmp_path, size, sha256, head = _save_upload(file, ext, max_mb * 1024 * 1024)

    title = " ".join((title or "").split())[:200]
    author = " ".join((author or "").split())[:200]
    try:
        if size == 0:
            raise HTTPException(status_code=400, detail="The file is empty")
        try:
            kb.check_file(ext, head)
        except kb.IngestError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        svc = get_service_client()
        dup = (
            svc.table("kb_documents")
            .select("title, status")
            .eq("sha256", sha256)
            .limit(1)
            .execute()
            .data
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"This file is already in the knowledge base as "
                f"“{dup[0]['title']}” ({dup[0]['status']}).",
            )

        default_title = " ".join(
            Path(file_name).stem.replace("_", " ").replace("-", " ").split()
        )
        try:
            row = (
                svc.table("kb_documents")
                .insert(
                    {
                        "title": title or default_title or "Untitled",
                        "kind": kind,
                        "status": "processing",
                        "file_name": file_name[:255],
                        "mime_type": kb.MIME_TYPES[ext],
                        "size_bytes": size,
                        "sha256": sha256,
                        "author": author or None,
                        "uploaded_by": user.id,
                    }
                )
                .execute()
                .data[0]
            )
        except Exception as exc:
            if "23505" in str(exc) or "duplicate" in str(exc).lower():
                raise HTTPException(
                    status_code=409,
                    detail="This file is already in the knowledge base.",
                ) from exc
            raise HTTPException(
                status_code=502, detail=f"Could not save the document: {exc}"
            ) from exc
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise

    # the background task owns the temp file from here and deletes it
    background.add_task(
        kb.ingest_document,
        row["id"],
        tmp_path,
        user_id=user.id,
        use_file_title=not title,
        use_file_author=not author,
    )
    return {"document": row}


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: UUID, user: AuthUser = Depends(require_admin)
) -> dict:
    """Allowed even while processing: the job's next chunk insert then fails
    on the foreign key and it cleans up after itself."""
    svc = get_service_client()
    doc = _get(svc, str(document_id))
    # kb_chunks rows go with it (on delete cascade)
    svc.table("kb_documents").delete().eq("id", str(document_id)).execute()
    if doc.get("storage_path"):
        try:
            svc.storage.from_(kb.BUCKET).remove([doc["storage_path"]])
        except Exception:
            pass  # a leftover file in Storage is harmless
    # JSON body (not 204): the frontend api() helper always parses JSON
    return {"deleted": True, "id": str(document_id)}


@router.post("/documents/{document_id}/reindex", status_code=202)
def reindex_document(
    document_id: UUID,
    background: BackgroundTasks,
    user: AuthUser = Depends(require_admin),
) -> dict:
    """Re-run ingestion from the stored original (after a failure, a server
    restart, or a change to the chunking / embedding settings)."""
    svc = get_service_client()
    doc_id = str(document_id)
    doc = _get(svc, doc_id)
    if doc["status"] == "processing":
        raise HTTPException(
            status_code=409, detail="This document is already being processed."
        )
    if not doc.get("storage_path"):
        raise HTTPException(
            status_code=409,
            detail="The original file wasn't stored, so it can't be re-indexed "
            "— delete it and upload it again.",
        )

    try:
        data = svc.storage.from_(kb.BUCKET).download(doc["storage_path"])
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not fetch the original file: {exc}"
        ) from exc

    # conditional update: two clicks can't start two jobs on one document
    claimed = (
        svc.table("kb_documents")
        .update({"status": "processing", "error": None, "chunks_embedded": 0})
        .eq("id", doc_id)
        .neq("status", "processing")
        .execute()
        .data
    )
    if not claimed:
        raise HTTPException(
            status_code=409, detail="This document is already being processed."
        )

    fd, tmp_path = tempfile.mkstemp(
        prefix="kb-", suffix=Path(doc["storage_path"]).suffix.lower()
    )
    with os.fdopen(fd, "wb") as out:
        out.write(data)

    background.add_task(
        kb.ingest_document, doc_id, tmp_path, user_id=user.id, store_original=False
    )
    return {
        "document": {**doc, "status": "processing", "error": None, "chunks_embedded": 0}
    }
