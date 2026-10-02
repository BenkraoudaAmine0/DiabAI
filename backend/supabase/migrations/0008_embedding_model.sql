-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0008 — knowledge base: remember which model embedded each document
-- Run ONCE in Supabase SQL Editor (after 0007_role_hardening.sql).
--
-- The knowledge base can now be embedded by a free local model
-- (EMBEDDING_PROVIDER=local, google/embeddinggemma-300m — the default) or by
-- Gemini (EMBEDDING_PROVIDER=gemini). Vectors from two models can't be
-- compared, so each document records its model and the chatbot only searches
-- documents embedded by the model it uses for the question.
--
-- Documents ingested before this migration were embedded by Gemini. With the
-- local model they are skipped by the search until an admin re-indexes them
-- (admin dashboard → Knowledge base → Re-index, or
--  `python scripts/ingest_kb.py`, which re-embeds them automatically).
-- Additive: match_kb_chunks_v2 is left in place.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kb_documents
  add column if not exists embedding_model text;  -- e.g. 'local:google/embeddinggemma-300m'

update public.kb_documents
   set embedding_model = 'gemini:gemini-embedding-001'
 where embedding_model is null
   and status = 'ready';

-- Same as match_kb_chunks_v2, plus: only documents embedded by `model_id`
-- (null = any model).
create or replace function public.match_kb_chunks_v3 (
  query_embedding vector (768),
  match_count     int default 5,
  min_similarity  double precision default 0,
  document_ids    uuid[] default null,
  model_id        text default null
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
    and (model_id is null or d.embedding_model = model_id)
    and (document_ids is null or c.document_id = any (document_ids))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;
