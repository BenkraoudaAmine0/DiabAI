"""Ingest the knowledge base into Supabase pgvector for the RAG chatbot.

LangChain pipeline (replaces the old custom chunker/embedder):
  DirectoryLoader(TextLoader) → RecursiveCharacterTextSplitter(900/150) →
  GoogleGenerativeAIEmbeddings → SupabaseVectorStore.from_documents into the
  EXISTING kb_chunks table (document_id / chunk_index / content / embedding
  vector(768)) — the database schema is untouched.

Run from the backend folder (needs backend/.env configured):

    cd backend
    python scripts/ingest_kb.py

Idempotent: wipes kb_chunks / kb_documents first (full re-ingest).
"""

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.services.kb_vectorstore import DiabAIVectorStore
from app.services.supabase_client import get_service_client
from app.services.usage_service import log_usage

KB_DIR = BACKEND / "knowledge_base"
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150


def load_documents():
    """All .md / .txt files in knowledge_base/ as LangChain Documents."""
    docs = []
    for pattern in ("*.md", "*.txt"):
        loader = DirectoryLoader(
            str(KB_DIR),
            glob=pattern,
            loader_cls=TextLoader,
            loader_kwargs={"encoding": "utf-8"},
            show_progress=True,
        )
        docs.extend(loader.load())
    return docs


def main() -> None:
    docs = load_documents()
    if not docs:
        print(f"No .md/.txt files found in {KB_DIR}")
        return

    s = get_settings()
    svc = get_service_client()

    # idempotent full re-ingest
    svc.table("kb_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    svc.table("kb_documents").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )

    all_splits = []
    total_chars = 0
    for doc in docs:
        source = Path(doc.metadata.get("source", "doc.md"))
        title = source.stem.replace("-", " ").replace("_", " ").title()

        # keep a copy of the source doc in Storage
        storage_path = f"kb/{source.name}"
        try:
            svc.storage.from_("kb-docs").upload(
                storage_path, doc.page_content.encode("utf-8"), {"upsert": "true"}
            )
        except Exception as exc:
            print(f"  (storage upload skipped: {exc})")
            storage_path = ""

        doc_row = (
            svc.table("kb_documents")
            .insert({"title": title, "storage_path": storage_path})
            .execute()
            .data[0]
        )

        splits = splitter.split_documents([doc])
        for i, sp in enumerate(splits):
            # metadata mapped to the real kb_chunks columns by DiabAIVectorStore
            sp.metadata = {"document_id": doc_row["id"], "chunk_index": i}
        all_splits.extend(splits)
        total_chars += len(doc.page_content)
        print(f"- {source.name}: {len(splits)} chunks")

    embeddings = GoogleGenerativeAIEmbeddings(
        model=s.gemini_embedding_model,
        google_api_key=s.gemini_api_key,
        output_dimensionality=s.embedding_dimensions,
    )

    DiabAIVectorStore.from_documents(
        all_splits,
        embeddings,
        client=svc,
        table_name="kb_chunks",
        query_name="match_kb_chunks",
    )

    log_usage(
        user_id=None,
        kind="embedding",
        model=s.gemini_embedding_model,
        input_tokens=0,  # embeddings API does not report token counts
        output_tokens=0,
        detail={
            "documents": len(docs),
            "chunks": len(all_splits),
            "characters": total_chars,
            "note": "embedding token counts are not exposed by the API",
        },
    )

    print(
        f"\nDone: {len(docs)} documents, {len(all_splits)} chunks "
        f"embedded with {s.gemini_embedding_model} "
        f"-> Supabase pgvector (kb_chunks)"
    )


if __name__ == "__main__":
    main()
