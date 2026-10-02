-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0004 — knowledge-base uploads (admin dashboard): documents & books
-- Run ONCE in Supabase SQL Editor (after 0003_kb_index.sql).
--
-- Additive only: new columns on kb_documents / kb_chunks, one index and a
-- NEW search function match_kb_chunks_v2. Existing columns and the original
-- match_kb_chunks function are unchanged.
--
-- Existing rows (seeded by scripts/ingest_kb.py before this migration) get
-- kind = 'document' and status = 'ready', so the chatbot keeps using them.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kb_documents
  add column if not exists kind            text not null default 'document'
                                           check (kind in ('document', 'book')),
  add column if not exists status          text not null default 'ready'
                                           check (status in ('processing', 'ready', 'failed')),
  add column if not exists error           text,
  add column if not exists file_name       text,
  add column if not exists mime_type       text,
  add column if not exists size_bytes      bigint,
  add column if not exists sha256          text unique,  -- duplicate-upload guard
  add column if not exists author          text,
  add column if not exists page_count      int,          -- PDF pages (null for other formats)
  add column if not exists chunk_count     int,          -- total chunks after splitting
  add column if not exists chunks_embedded int not null default 0,  -- progress while processing
  add column if not exists uploaded_by     uuid references public.profiles (id) on delete set null;

-- Per-chunk citation data, e.g. {"page": 142, "page_label": "130", "chapter": "Insulin therapy"}
alter table public.kb_chunks
  add column if not exists metadata jsonb;

-- Books add thousands of chunks per document: speeds up the cascade delete
-- and per-document re-index.
create index if not exists kb_chunks_document_id_idx
  on public.kb_chunks (document_id);

-- ── search v2 ───────────────────────────────────────────────────────────────
-- Same cosine search as match_kb_chunks, plus:
--   * only documents with status = 'ready' (a book still being embedded is
--     never half-searchable)
--   * returns the chunk metadata (page / chapter) for citations
--   * optional similarity floor and document filter
create or replace function public.match_kb_chunks_v2 (
  query_embedding vector (768),
  match_count     int default 5,
  min_similarity  double precision default 0,
  document_ids    uuid[] default null
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  title       text,
  kind        text,
  metadata    jsonb,
  similarity  double precision
)
language sql
stable
as $$
  select c.id,
         c.document_id,
         c.content,
         d.title,
         d.kind,
         c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where d.status = 'ready'
    and (document_ids is null or c.document_id = any (document_ids))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;
