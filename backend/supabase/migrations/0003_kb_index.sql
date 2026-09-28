-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0003 — fix kb_chunks ANN index for small/medium datasets
--
-- Problem: the ivfflat index (lists=100) can return ZERO results when the
-- table holds fewer rows than the number of lists: each row lands in its own
-- cluster and a query embedding often hashes into an empty cluster, so the
-- index scan finds nothing (verified live: self-queries matched, fresh
-- queries returned 0 rows).
--
-- Fix: drop ivfflat, create an HNSW index instead — graph-based search
-- always returns results at any table size and scales just as well.
-- Tables and the match_kb_chunks function are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

drop index if exists public.kb_chunks_embedding_idx;

create index if not exists kb_chunks_embedding_hnsw_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops);
