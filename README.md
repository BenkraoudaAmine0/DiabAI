# DiabAI

AI-powered diabetes screening & care platform — ThirUni Program.

Doctors detect diabetes and screen for its complications; patients check
visible risk indicators themselves. One unified web app combining:

| Model                                     | Type               | Who can use it   |
| ----------------------------------------- | ------------------ | ---------------- |
| Diabetes risk prediction (XGBoost + SHAP) | Machine learning   | Doctor only      |
| Foot ulcer detection                      | Deep learning (CV) | Doctor + Patient |
| Neck / Acanthosis Nigricans detection     | Deep learning (CV) | Doctor + Patient |
| Eye / Retinopathy grading (5 levels)      | Deep learning (CV) | Doctor only      |
| RAG chatbot assistant (Gemini + pgvector) | LLM                | Doctor + Patient |

**Stack:** Next.js 16 (TypeScript, Tailwind) · FastAPI (Python, LangChain +
LangGraph RAG) · Supabase only — Auth (email/password), Postgres + pgvector
(all data), Storage (scan images, SHAP explanations, knowledge base) · Gemini
as the single LLM (`gemini-3.5-flash-lite`), no fallback model.

**Docs:** [roles & permissions (admin, doctor, patient)](docs/ROLES.md) ·
[RAG architecture, verification & code review](docs/RAG_ARCHITECTURE.md)

---

## Project layout

```
DiabAI/
├── backend/
│   ├── app/
│   │   ├── main.py                  FastAPI entrypoint (+ /api/health model status)
│   │   ├── config.py                pydantic-settings (.env)
│   │   ├── auth.py                  Supabase JWT verify + role guards
│   │   ├── schemas.py               request/response models
│   │   ├── routers/
│   │   │   ├── diabetes.py          predict, report, review, interpretation, PDF
│   │   │   ├── vision.py            POST /api/scan/{foot|neck|eye}  (eye: doctor)
│   │   │   ├── patients.py          panel CRUD + account creation + history
│   │   │   ├── records.py           GET /api/records/me (own history)
│   │   │   ├── chat.py              POST /api/chat (RAG, cited answers)
│   │   │   ├── admin.py             GET /api/admin/{stats,users}       (admin)
│   │   │   └── kb.py                /api/admin/kb/documents upload/list/delete/re-index (admin)
│   │   └── services/
│   │       ├── supabase_client.py   anon (auth) + service-role (DB/Storage) clients
│   │       ├── diabetes_service.py  XGBoost + scaler + threshold + SHAP + tiers
│   │       ├── vision_service.py    multi-format loader (.onnx/.h5/.keras/.pt/.pth)
│   │       ├── gemini_service.py    one Gemini model (chat model, image reading)
│   │       ├── rag_service.py       LangGraph: condense → retrieve → generate
│   │       ├── interpretation_service.py  clinical interpretation (Gemini)
│   │       ├── report_service.py    prediction report PDF (ReportLab, EN/FR)
│   │       ├── kb_loaders.py        PDF/DOCX/EPUB/TXT/MD → text, tables, figures
│   │       ├── kb_ingest_service.py loaders → chunks → embeddings → kb_chunks
│   │       └── kb_vectorstore.py    SupabaseVectorStore adapter for kb_chunks
│   ├── models_app/                  ← YOUR trained models go here (see below)
│   ├── knowledge_base/              seed diabetes docs for the chatbot
│   ├── scripts/
│   │   ├── ingest_kb.py             CLI ingestion (same pipeline as admin upload)
│   │   └── verify_diabetes.py       replays the 8 notebook test scenarios
│   ├── supabase/migrations/000{1..8}_*.sql ← run once each, in order, in SQL Editor
│   ├── requirements.txt · .env.example
├── frontend/                        Next.js app (EN/FR toggle)
│   └── src/{app,components,contexts,i18n,lib}
├── docs/                            ROLES.md · RAG_ARCHITECTURE.md
├── datasets/                        diabetes_prediction_dataset.csv (training)
└── models/                          original training artifacts + notebooks
```

---

## Setup — 6 steps

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → New query → paste **all** of
   `backend/supabase/migrations/0001_init.sql` → **Run**, then do the same,
   in order, with `0002_admin.sql` … `0009_embedding_model.sql`.
   All nine are required:

   | Migration | Adds |
   | --------- | ---- |
   | 0001 | tables, RLS policies, `match_kb_chunks`, `scans` / `kb-docs` buckets |
   | 0002 | `gemini_usage` (admin usage & cost view) |
   | 0003 | HNSW vector index |
   | 0004 | `notifications` table + Realtime publication for the in-app bell |
   | 0005 | knowledge-base upload status, file info, page / chapter citations, `match_kb_chunks_v2` |
   | 0006 | knowledge-base extraction stats (tables, images read, scanned pages) |
   | 0007 | prediction review (pending / confirmed / rejected) + clinical interpretation; patients only read confirmed predictions |
   | 0008 | **security:** nobody can sign up as admin or change their own role / email; creates missing profiles |
   | 0009 | records which embedding model indexed each document; search only uses documents of the current model |
3. Project Settings → API: copy the **Project URL**, the **anon public key**
   and the **service_role key**.
4. Authentication → **URL Configuration**:
   - **Site URL**: your frontend, e.g. `http://localhost:3000`
   - **Redirect URLs**: add `http://localhost:3000/**` (and your production
     URL + `/**`) — it covers `/auth/callback` and `/set-password`, where
     invitation and password-reset emails lead. Without it, Supabase falls
     back to the Site URL (the landing page then forwards the link). Set
     `FRONTEND_URL` in `backend/.env` to the same frontend URL.

> **Auth settings:** Authentication → Providers → Email must be enabled.
> Email confirmation: ON is recommended for public signups — but Supabase's
> built-in email only reaches your project's team members, so turn it off
> for development or set up custom SMTP. The doctor-created patient accounts
> (temp-password method) bypass confirmation automatically.

### 2. Gemini API key

Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
The model name is set by `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) —
change it in one place (`backend/.env`) if Google renames the model. There is
**no fallback model** by design.

### 3. Backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate     # (Windows) or source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                              # then fill in all values
uvicorn app.main:app --reload --port 8000
```

On startup the log prints model availability; `/api/health` returns the same
status JSON. Missing models never crash the app — their endpoints return 503
with instructions.

**Check the whole setup** (read-only — env files, Supabase connection and
Auth settings, migrations, buckets, Gemini key and model names, ML model):

```bash
python scripts/check_setup.py        # Windows: .venv\Scripts\python.exe scripts\check_setup.py
```

> Windows: if `pip.exe` / `uvicorn.exe` are blocked ("stratégie de contrôle
> d'application"), call them through Python: `.venv\Scripts\python.exe -m pip …`,
> `.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.
> If `npm` is blocked by the PowerShell execution policy, use `npm.cmd`.

### 4. Knowledge base (chatbot)

```bash
cd backend
python scripts/ingest_kb.py
```

Ingests every supported file in `knowledge_base/` — **PDF, EPUB, Word
(.docx), TXT, Markdown** — with the same pipeline as the admin dashboard
upload (`app/services/kb_ingest_service.py`): LangChain loaders
(`app/services/kb_loaders.py` — PyMuPDF, python-docx, ebooklib) that read
the text, the **tables** (as Markdown) and the **images** (figures, charts,
scanned pages, read by Gemini — at most `KB_MAX_VISION_CALLS` per file) →
`RecursiveCharacterTextSplitter` (900/150; tables are cut between rows only)
→ embeddings (768 dims) → `kb_chunks` through `DiabAIVectorStore` (see
`app/services/kb_vectorstore.py`).

**Embedding model** (`EMBEDDING_PROVIDER` in `backend/.env`):

| | `local` (default) | `gemini` |
| --- | --- | --- |
| Model | `google/embeddinggemma-300m`, on the server (fastembed / ONNX) | `gemini-embedding-001` (API) |
| Cost / limits | free, no limits | free tier ≈ 1 000 requests/day, 30 k tokens/min |
| 1 100-page book (≈ 4 000 chunks) | ≈ 15 min on a laptop CPU | can take days on the free tier; ≈ $0.10 paid |
| Needs | ~1.2 GB download once (`models_app/embeddings/`), ~1.5 GB RAM | `GEMINI_API_KEY` |

Questions and documents must be embedded by the **same** model, so each
document remembers its model (migration 0009) and the chatbot only searches
documents of the current one. After changing `EMBEDDING_PROVIDER`, re-index
the knowledge base (admin dashboard → *Re-index*, or run
`scripts/ingest_kb.py` again — it re-embeds what another model indexed). PDF chunks keep their page number and
chapter (from the PDF bookmarks), EPUB / Word chunks their chapter /
section, so the chatbot cites "Title · Chapter · p. 142". Details:
[docs/RAG_ARCHITECTURE.md](docs/RAG_ARCHITECTURE.md).

Re-running is safe: files already ingested (same content hash) are skipped.

```bash
python scripts/ingest_kb.py path/to/book.pdf --kind book   # specific files
python scripts/ingest_kb.py --reset                        # wipe the whole KB first
```

`--reset` also deletes documents admins uploaded from the dashboard.

The easier way for day-to-day use is the admin dashboard (see **Admin**).

### 5. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local                        # then fill in Supabase URL/anon key
npm run dev                                          # http://localhost:3000
```

### 6. Vision models (when ready)

See `backend/models_app/README.md`. Drop one file per folder —
`model.onnx` (recommended), `model.h5`, `model.keras`, or TorchScript
`model.pt/.pth` — optionally with a `labels.json`:

```json
{"labels": ["no_ulcer", "ulcer"], "image_size": 224}
```

Until then, `/api/scan/{foot|neck|eye}` returns 503 with a clear message.

---

## How it works

### Diabetes prediction (doctor)

The form maps directly onto the trained model's 8 features
(`gender, age, hypertension, heart_disease, smoking_history, bmi, HbA1c_level, blood_glucose_level`). The backend replicates
`models/test_model.ipynb` exactly:

- encodings from the training pipeline: `Female→0 / Male→1`;
  smoking `never|No Info→non-smoker(1)`, `current→0`,
  `ever|former|not current→past_smoker(2)`;
- `prob = model.predict_proba(scaled)[0][1]`, positive at threshold **0.395**;
- risk tier with the **Prediabetic override first** (HbA1c 5.7–6.5 *and*
  glucose 100–126 → `Prediabetic ⚠️`), then Low <0.3 · Moderate <0.5 ·
  High <0.75 · Critical;
- SHAP values for all 8 features, and a SHAP waterfall PNG (stored in
  Supabase Storage) labelled with the entered values ("6.2 % = HbA1c").

After **Predict**, the doctor lands on the **report** (`/predictions/{id}`):
risk gauge with the decision threshold, probability, tier, the entered
values against reference ranges, the main contributing factors, and a
**clinical interpretation written by Gemini** (stored per language,
regenerable). From there the doctor can:

- **Confirm & validate** or **Reject**, with an optional note — every
  prediction is *pending* until then, and **patients only see confirmed
  predictions** (API and RLS, migration 0007);
- **Modify inputs** — back to the form, prefilled, for a new prediction;
- **Export PDF** — the same report in English or French (ReportLab), also
  available from the patient's file and, once confirmed, to the patient.

`python scripts/verify_diabetes.py` replays the notebook's 8 test scenarios
and asserts the tier logic.

### Patient accounts created by a doctor

Doctors create patient accounts in **My patients → New patient**, choosing:

- **Email invitation** — Supabase sends a link that opens `/set-password`,
  where the patient creates their own password and is signed in immediately.
  The redirect target comes from `FRONTEND_URL` in `backend/.env`. An
  expired link shows a clear message: the doctor sends a new one from the
  patient's page (*Login access*), or the patient uses **Forgot password?**
  on the sign-in page, which leads to the same page.
  (Uses Supabase's built-in SMTP, which is rate-limited on the free tier —
  configure custom SMTP in Auth → SMTP for real use.)
- **Temporary password** — a 12-char password is generated via the Admin API
  and shown **once** on the doctor's screen with a copy button; the doctor
  shares it in person. The patient can change it later in Profile.

Doctors can also **Add existing** (link a self-registered patient by email),
and every patient a doctor runs a diagnostic for is added to their panel
automatically. A doctor sees the **full clinical history** (predictions +
scans, including records made by other doctors) of every panel patient at
`/doctor/patients/{id}`. Patients see their own scans and the diabetes
predictions their doctor **confirmed** under **My history**.

### RAG chatbot

A LangGraph graph (`app/services/rag_service.py`):
**condense** (a follow-up like "and for children?" is rewritten into a
standalone query from the conversation) → **retrieve** (question embedded by the KB's model →
`match_kb_chunks_v3`, cosine similarity, `ready` documents of that model only, top 5) →
**generate** (grounded `gemini-3.5-flash-lite` answer with `[n]` citations,
shown as source chips with chapter, page and a *table* / *figure* tag) — or
**no_context** when nothing relevant was found (no model call).
`KB_MIN_SIMILARITY` in `backend/.env` drops weak matches — it defaults to
`0` (always top 5); try ~`0.5` once you have real questions to tune it on.
Each step is a LangChain component: `DiabAIVectorStore` (a
`SupabaseVectorStore` adapter), LCEL chains (`prompt | llm |
StrOutputParser()`), token usage logged per call. A conversation keeps its
session, so the bot remembers the last exchanges; *New conversation* starts
over. It answers in English or French (matching the question) and never
diagnoses. Architecture, tests and review:
[docs/RAG_ARCHITECTURE.md](docs/RAG_ARCHITECTURE.md).

### Notifications

A bell in the top bar shows unread in-app notifications for every user,
updated **live** via Supabase Realtime (with a 60s polling fallback).
Triggered events: a doctor records a **diabetes prediction** or a **scan**
for a patient → the patient is notified; a patient account is
**created or linked** to a doctor's panel → the patient gets a welcome
notification. Notification text is structured (`kind` + `data`), so titles
render in the user's language (EN/FR). Clicking one navigates to the
relevant page and marks it read; "Mark all read" clears the badge.

### Admin

Make an admin (SQL Editor):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

The admin signs in like anyone else and gets an **Admin** dashboard at
`/admin/dashboard` showing doctors, patients, Storage usage per bucket, and
Gemini API usage (calls, tokens, estimated cost). Admins also have full
doctor-level access to every clinical tool. Cost estimates use the
per-million-token prices in `backend/.env`
(`GEMINI_INPUT_PRICE_PER_MTOK`, `GEMINI_OUTPUT_PRICE_PER_MTOK`,
`GEMINI_EMBEDDING_PRICE_PER_MTOK`) — adjust them to your actual pricing.
Embedding tokens aren't reported by the API, so they are estimated at
~4 characters per token.

**Knowledge base.** The dashboard's *Knowledge base* card uploads documents
and books (PDF, EPUB, DOCX, TXT, MD) for the chatbot. Pick *Document* or
*Book*, optionally a title and author (otherwise taken from the file's own
metadata, then its name), and upload. The API answers `202` immediately;
text extraction, chunking and embedding run as a FastAPI background task
while the table shows *Processing · n%*. A document is only searchable once
it is *Ready*. Tables and images inside the files are read too (the table
shows e.g. *3 tables · 5 images read*); scanned PDFs are transcribed by
Gemini. Duplicates (same file content) are refused; failed uploads show the
reason and can be re-indexed from the stored original; *Delete* removes the
document, its chunks and the stored file. Everything the admin role can do:
[docs/ROLES.md](docs/ROLES.md).

Size limits: `KB_MAX_DOCUMENT_MB` (25) and `KB_MAX_BOOK_MB` (100) in
`backend/.env`; images read per file: `KB_MAX_VISION_CALLS` (60, one Gemini
call each, counted in the usage view). Supabase Storage's free plan caps files at **50 MB**: a
larger book is still indexed, but its original isn't stored, so it can't be
re-indexed later. Background tasks live in the API process: an upload cut
off by a restart is marked *Failed* at the next startup — re-index it. Run
the API with a single worker process (the default) for that reason.

### Security

- Frontend auth via `@supabase/ssr`; Next.js `proxy.ts` guards every private
  route; the `(app)` layout additionally enforces the doctor/patient boundary.
- All API calls carry the Supabase access token; FastAPI verifies it and
  enforces roles (`require_doctor` for predictions, eye scans, panel admin).
- All writes go through the backend with the service-role key; RLS policies
  (`0001_init.sql`) protect direct client reads: patients read only their own
  data (confirmed predictions only, `0007`), doctors only their panel's;
  admin endpoints are role-gated (`require_admin`) and `gemini_usage` has RLS
  enabled with no policies (backend-only).
- Roles can't be self-assigned (`0008`): signups are doctor or patient only,
  and users can edit only their name, phone, birth date and sex. The admin
  role is granted from the SQL Editor.
- Signup is open, so anyone can register as a doctor and link patients by
  email — see the open items in
  [docs/RAG_ARCHITECTURE.md](docs/RAG_ARCHITECTURE.md#code-review).
- Storage buckets are private; images are served via 24h signed URLs.

---

## Running for a demo

```bash
# terminal 1 — backend
cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000
# terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:3000 → register (choose Doctor) → add a patient →
run a diabetes prediction → on the report, **Confirm & validate** (and try
**Export PDF**). Sign in as the patient (temp password, or the invitation
email's set-password page) → **My history** shows the confirmed diagnostic.

## Troubleshooting

| Symptom                        | Fix                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `Supabase is not configured` | Fill`backend/.env` (and `frontend/.env.local`)                                  |
| 401 from API                   | Frontend env missing or token expired — re-login                                   |
| 403 Doctor access only         | Signed in as patient; use a doctor account                                          |
| 503 model not installed        | Add`model.<ext>` to `backend/models_app/<scan>/`                                |
| Chat finds nothing in the KB   | Upload documents from the admin dashboard, or run`python scripts/ingest_kb.py`   |
| KB upload/list fails, `column … does not exist` | Apply migrations `0005_kb_uploads.sql` and `0006_kb_rich_content.sql` |
| Report page: "Prediction review isn't set up" | Apply `0007_prediction_review.sql`                                          |
| Invite email not arriving      | Supabase free SMTP is rate-limited; use the temp-password method or set custom SMTP |
| Invite link opens the home page / "This link can't be used" | Add `FRONTEND_URL/**` to Auth → URL Configuration → Redirect URLs; links expire after 24 h and work once — patient can use *Forgot password?* |
| A patient doesn't see a prediction | It is still *pending*: confirm it on the report page                                |
| PDF uploaded, "images skipped"  | Raise `KB_MAX_VISION_CALLS` in `backend/.env`, then *Re-index*                     |
| Document shows "Not searched: embedded by another model" | It was indexed with the other `EMBEDDING_PROVIDER` — *Re-index* it |
| Chat: "knowledge-base search function is missing" | Apply `0009_embedding_model.sql` |
| API log: "local model unavailable" | `python -m pip install -r requirements.txt` (fastembed); the first start needs internet to download the model |
| Windows: `DLL load failed … stratégie de contrôle d'application` | Smart App Control blocked a native module of a freshly installed package; retry, or use a version with wider distribution (e.g. `numba<0.64`, `scikit-learn==1.8.0`) |
