"""Ingest knowledge-base files into Supabase pgvector for the RAG chatbot.

Same pipeline as the admin dashboard upload (app/services/kb_ingest_service):
PDF / EPUB / DOCX / TXT / MD → LangChain loaders (text, tables, images read
by Gemini — app/services/kb_loaders) → RecursiveCharacterTextSplitter
(900/150, tables cut between rows) → embeddings (EMBEDDING_PROVIDER: local
EmbeddingGemma by default, or Gemini) → kb_chunks. Requires migrations
0005, 0006 and 0009.

Run from the backend folder (needs backend/.env configured):

    cd backend
    python scripts/ingest_kb.py                            # all of knowledge_base/
    python scripts/ingest_kb.py path/to/book.pdf --kind book
    python scripts/ingest_kb.py --reset                    # wipe the KB first

Files already in the knowledge base (same content hash, embedded by the
current model) are skipped, so it is safe to re-run; files embedded by
another model, or that failed, are re-embedded in place. --reset deletes
EVERYTHING, including documents admins uploaded from the dashboard.

Big books are faster from here than from the dashboard upload: no upload
size limit, and you see the progress in the terminal.
"""

import argparse
import hashlib
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import embeddings  # noqa: E402
from app.services import kb_ingest_service as kb  # noqa: E402
from app.services.supabase_client import get_service_client  # noqa: E402

KB_DIR = BACKEND / "knowledge_base"
NIL_UUID = "00000000-0000-0000-0000-000000000000"
STORAGE_PAGE = 1000


def legacy_title(path: Path) -> str:
    """Title this script has always given a file ("01 Diabetes Overview")."""
    return path.stem.replace("-", " ").replace("_", " ").title()


def reset(svc) -> None:
    svc.table("kb_chunks").delete().neq("id", NIL_UUID).execute()
    svc.table("kb_documents").delete().neq("id", NIL_UUID).execute()
    try:
        bucket = svc.storage.from_(kb.BUCKET)
        while True:
            items = bucket.list("kb", {"limit": STORAGE_PAGE, "offset": 0}) or []
            paths = [f"kb/{i['name']}" for i in items if i.get("name")]
            if not paths:
                break
            bucket.remove(paths)
            if len(items) < STORAGE_PAGE:
                break
    except Exception as exc:
        print(f"  (storage cleanup skipped: {exc})")
    print("Knowledge base wiped.\n")


def ingest(svc, path: Path, kind: str) -> str:
    data = path.read_bytes()
    ext = path.suffix.lower()
    kb.check_file(ext, data[:8192])
    sha256 = hashlib.sha256(data).hexdigest()

    file_info = {
        "file_name": path.name,
        "mime_type": kb.MIME_TYPES[ext],
        "size_bytes": len(data),
        "sha256": sha256,
    }
    columns = "id, status, embedding_model"
    existing = (
        svc.table("kb_documents").select(columns).eq("sha256", sha256)
        .limit(1).execute().data
    )
    if not existing:
        # Ingested before migration 0005, so no hash is stored yet: record it
        # instead of adding a duplicate copy.
        existing = (
            svc.table("kb_documents").select(columns)
            .eq("title", legacy_title(path)).is_("sha256", "null")
            .limit(1).execute().data
        )
        if existing:
            svc.table("kb_documents").update(file_info).eq("id", existing[0]["id"]).execute()

    if existing:
        doc = existing[0]
        if doc["status"] == "ready" and doc.get("embedding_model") == embeddings.model_id():
            return "skipped (already ingested)"
        # failed, interrupted, or embedded by another model: redo it in place
        svc.table("kb_documents").update(
            {"status": "processing", "error": None, "chunks_embedded": 0}
        ).eq("id", doc["id"]).execute()
        error = kb.ingest_document(doc["id"], path, use_file_author=True, delete_file=False)
        if error:
            return f"FAILED — {error}"
        return f"re-embedded with {embeddings.model_id()}"

    row = (
        svc.table("kb_documents")
        .insert(
            {
                "title": legacy_title(path),
                "kind": kind,
                "status": "processing",
                **file_info,
            }
        )
        .execute()
        .data[0]
    )
    error = kb.ingest_document(
        row["id"],
        path,
        use_file_title=kind == "book",  # a book's own title beats its file name
        use_file_author=True,
        delete_file=False,
    )
    if error:
        return f"FAILED — {error}"
    done = (
        svc.table("kb_documents")
        .select("title, chunk_count")
        .eq("id", row["id"])
        .execute()
        .data[0]
    )
    return f"{done['chunk_count']} chunks -> \"{done['title']}\""



def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest files into the DiabAI knowledge base."
    )
    parser.add_argument(
        "files",
        nargs="*",
        type=Path,
        help="files to ingest (default: every supported file in knowledge_base/)",
    )
    parser.add_argument("--kind", choices=("document", "book"), default="document")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete the WHOLE knowledge base first, dashboard uploads included",
    )
    parser.add_argument("--yes", action="store_true", help="don't ask before --reset")
    args = parser.parse_args()

    files = args.files or sorted(
        p
        for p in KB_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in kb.SUPPORTED_EXTENSIONS
    )
    if not files and not args.reset:
        print(f"No {'/'.join(kb.SUPPORTED_EXTENSIONS)} files found in {KB_DIR}")
        return

    svc = get_service_client()
    if args.reset:
        if not args.yes:
            answer = input(
                "--reset deletes every knowledge-base document, including "
                "uploads from the admin dashboard. Type 'yes' to continue: "
            )
            if answer.strip().lower() != "yes":
                print("Aborted.")
                return
        reset(svc)

    failed = 0
    for path in files:
        try:
            result = ingest(svc, path, args.kind)
        except (kb.IngestError, OSError) as exc:
            result = f"FAILED — {exc}"
        failed += result.startswith("FAILED")
        print(f"- {path.name}: {result}")

    print(f"\nDone: {len(files)} file(s), {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
