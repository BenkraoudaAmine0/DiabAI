"""SupabaseVectorStore adapter for DiabAI's EXISTING kb_chunks schema.

LangChain's stock SupabaseVectorStore assumes a table with (content,
embedding, metadata) columns and calls the match RPC with a `query_count`
argument. Our schema (see supabase/migrations/0001_init.sql + 0004) is:

    kb_chunks(id, document_id, chunk_index, content, embedding vector(768),
              metadata jsonb)
    match_kb_chunks_v3(query_embedding, match_count, min_similarity,
                       document_ids, model_id)
        -> (…, title, kind, metadata, similarity)            (migration 0008)

This subclass maps inserts to the real columns (document_id / chunk_index
become columns, any other metadata such as page / chapter goes to the
`metadata` jsonb) and the search to the real RPC argument names. It is still
a SupabaseVectorStore — from_documents / similarity_search all work, and
`score_threshold` / `filter={"document_ids": [...], "embedding_model": ...}`
are honoured.
"""

from typing import Any, Iterable, List, Optional, Tuple

from langchain_community.vectorstores import SupabaseVectorStore
from langchain_core.documents import Document

BATCH = 500  # PostgREST max rows per request
COLUMN_KEYS = ("document_id", "chunk_index")  # metadata keys stored as columns


class DiabAIVectorStore(SupabaseVectorStore):
    def _get_table_name(self) -> str:
        # langchain-community versions differ: public `table_name` vs `_table_name`
        name = getattr(self, "table_name", None) or getattr(self, "_table_name", None)
        assert name, "SupabaseVectorStore table name not found"
        return str(name)

    @classmethod
    def from_texts(
        cls,
        texts: Iterable[str],
        embedding: Any,
        metadatas: Optional[List[dict]] = None,
        client: Any = None,
        table_name: str = "kb_chunks",
        query_name: str = "match_kb_chunks_v3",
        chunk_size: int = BATCH,
        **kwargs: Any,
    ) -> "DiabAIVectorStore":
        """Stock from_texts routes through _add_vectors, which upserts a
        `metadata` column we don't have — build the store and use our
        schema-mapped add_texts instead."""
        if client is None:
            raise ValueError("DiabAIVectorStore requires a Supabase client.")
        instance = cls(
            client=client,
            embedding=embedding,
            table_name=table_name,
            query_name=query_name,
            chunk_size=chunk_size,
        )
        instance.add_texts(texts, metadatas=metadatas)
        return instance

    def _embed_all(self, texts: List[str]) -> List[List[float]]:
        # `_embedding` (current) vs `_embeddings` (older) vs base property
        embeddings = (
            getattr(self, "_embedding", None)
            or getattr(self, "_embeddings", None)
            or self.embeddings
        )
        return embeddings.embed_documents(texts)

    def add_texts(
        self,
        texts: Iterable[str],
        metadatas: Optional[List[dict]] = None,
        ids: Optional[List[str]] = None,  # ignored — table generates uuids
        **kwargs: Any,
    ) -> List[str]:
        texts = list(texts)
        metadatas = list(metadatas) if metadatas else [{} for _ in texts]
        vectors = self._embed_all(texts)

        all_ids: List[str] = []
        for start in range(0, len(texts), BATCH):
            rows = [
                {
                    "content": text,
                    "embedding": vector,
                    "document_id": (meta or {}).get("document_id"),
                    "chunk_index": int((meta or {}).get("chunk_index", 0)),
                    "metadata": {
                        k: v
                        for k, v in (meta or {}).items()
                        if k not in COLUMN_KEYS and v is not None
                    }
                    or None,
                }
                for text, vector, meta in zip(
                    texts[start : start + BATCH],
                    vectors[start : start + BATCH],
                    metadatas[start : start + BATCH],
                )
            ]
            res = self._client.table(self._get_table_name()).insert(rows).execute()
            all_ids.extend(r["id"] for r in (res.data or []))
        return all_ids

    def similarity_search_by_vector_with_relevance_scores(
        self,
        embedding: List[float],
        k: int = 4,
        filter: Optional[dict] = None,
        score_threshold: Optional[float] = None,
        **kwargs: Any,
    ) -> List[Tuple[Document, float]]:
        # our RPC: match_kb_chunks_v3(query_embedding, match_count,
        #                             min_similarity, document_ids, model_id)
        params: dict = {"query_embedding": embedding, "match_count": k}
        if score_threshold is not None:
            params["min_similarity"] = float(score_threshold)
        if filter and filter.get("document_ids"):
            params["document_ids"] = [str(i) for i in filter["document_ids"]]
        if filter and filter.get("embedding_model"):
            params["model_id"] = str(filter["embedding_model"])
        res = self._client.rpc(self.query_name, params).execute()
        docs: List[Tuple[Document, float]] = []
        for row in res.data or []:
            docs.append(
                (
                    Document(
                        page_content=row.get("content", ""),
                        metadata={
                            **(row.get("metadata") or {}),  # page / chapter
                            "title": row.get("title") or "Diabetes knowledge base",
                            "kind": row.get("kind") or "document",
                            "document_id": str(row.get("document_id", "")),
                            "similarity": float(row.get("similarity") or 0.0),
                        },
                    ),
                    float(row.get("similarity") or 0.0),
                )
            )
        return docs
