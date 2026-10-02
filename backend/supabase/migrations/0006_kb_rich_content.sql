-- ═══════════════════════════════════════════════════════════════════════════
-- DiabAI 0006 — knowledge base: tables & images inside uploads
-- Run ONCE in Supabase SQL Editor (after 0005_kb_uploads.sql).
--
-- Additive only. Uploads are now read with their tables (Markdown) and
-- images (figures, charts and scanned pages read by Gemini). This column
-- records what was found, for the admin dashboard, e.g.
--   {"tables": 12, "figures": 8, "ocr_pages": 0, "images_skipped": 3}
-- Per-chunk details (content_type = table | figure, ocr) live in the
-- existing kb_chunks.metadata jsonb — no change to kb_chunks or to
-- match_kb_chunks_v2 is needed.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kb_documents
  add column if not exists extraction jsonb;
