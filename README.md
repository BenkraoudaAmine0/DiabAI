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

**Stack:** Next.js 16 (TypeScript, Tailwind) · FastAPI (Python, LangChain RAG) ·
Supabase only — Auth (email/password), Postgres + pgvector (all data),
Storage (scan images, SHAP explanations, knowledge base) · Gemini as the
single LLM (`gemini-3.5-flash-lite`), no fallback model.

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
│   │   │   ├── diabetes.py          POST /api/diabetes/predict      (doctor)
│   │   │   ├── vision.py            POST /api/scan/{foot|neck|eye}  (eye: doctor)
│   │   │   ├── patients.py          panel CRUD + account creation + history
│   │   │   ├── records.py           GET /api/records/me (own history)
│   │   │   └── chat.py              POST /api/chat (RAG, cited answers)
│   │   └── services/
│   │       ├── supabase_client.py   anon (auth) + service-role (DB/Storage) clients
│   │       ├── diabetes_service.py  XGBoost + scaler + threshold + SHAP + tiers
│   │       ├── vision_service.py    multi-format loader (.onnx/.h5/.keras/.pt/.pth)
│   │       ├── gemini_service.py    one Gemini model + embeddings (no fallback)
│   │       └── rag_service.py       pgvector retrieval → grounded answer
│   ├── models_app/                  ← YOUR trained models go here (see below)
│   ├── knowledge_base/              seed diabetes docs for the chatbot
│   ├── scripts/
│   │   ├── ingest_kb.py             chunk → embed → Supabase pgvector
│   │   └── verify_diabetes.py       replays the 8 notebook test scenarios
│   ├── supabase/migrations/0001_init.sql   ← run once in SQL Editor
│   ├── requirements.txt · .env.example
├── frontend/                        Next.js app (EN/FR toggle)
│   └── src/{app,components,contexts,i18n,lib}
├── datasets/                        diabetes_prediction_dataset.csv (training)
└── models/                          original training artifacts + notebooks
```

---

## Setup — 6 steps

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → New query → paste **all** of
   `backend/supabase/migrations/0001_init.sql` → **Run**, then do the same
   with `0002_admin.sql`, `0003_kb_index.sql` and `0004_notifications.sql`
   (all in `backend/supabase/migrations/`).
   (0001 creates tables, RLS policies, the `match_kb_chunks` RPC and the
   `scans` / `kb-docs` buckets; 0002 adds the `gemini_usage` table that
   powers the admin dashboard; 0003 fixes the pgvector index; 0004 adds
   the `notifications` table + Realtime publication for the in-app bell.)
3. Project Settings → API: copy the **Project URL**, the **anon public key**
   and the **service_role key**.

> **Auth settings:** Authentication → Providers → Email must be enabled.
> **URL Configuration (Authentication → URL Configuration):** set **Site
> URL** to `http://localhost:3000` and add to **Redirect URLs**:
> `http://localhost:3000/auth/callback` and `http://localhost:3000/set-password`
> (plus your production domain later). Without this, invite-email links
> won't reach the set-password page.
> Email confirmation: ON is recommended for public signups. The doctor-created
> patient accounts (temp-password method) bypass confirmation automatically.

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

### 4. Knowledge base (chatbot)

```bash
cd backend
python scripts/ingest_kb.py
```

Chunks every `.md` in `knowledge_base/` with LangChain
(`DirectoryLoader`/`TextLoader` → `RecursiveCharacterTextSplitter`, 900/150),
embeds them with `GoogleGenerativeAIEmbeddings`
(`gemini-embedding-001`, 768 dims) and stores them via
`SupabaseVectorStore.from_documents` into the existing `kb_chunks` table
(see `app/services/kb_vectorstore.py` for the schema adapter).
Add your own docs as `.md`/`.txt` and re-run — it is idempotent (full re-ingest).

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
- result shows score %, 🔴 Diabetic / 🟢 Non-Diabetic, tier, top-3 SHAP
  factors and a SHAP waterfall PNG (stored in Supabase Storage);
- every record is saved and visible to the patient in their history.

`python scripts/verify_diabetes.py` replays the notebook's 8 test scenarios
and asserts the tier logic.

### Patient accounts created by a doctor

Doctors create patient accounts in **My patients → New patient**, choosing:

- **Email invitation** — Supabase sends a link that opens `/set-password`,
  where the patient creates their own password and is signed in immediately.
  The redirect target comes from `FRONTEND_URL` in `backend/.env`.
  (Uses Supabase's built-in SMTP, which is rate-limited on the free tier —
  configure custom SMTP in Auth → SMTP for real use.)
- **Temporary password** — a 12-char password is generated via the Admin API
  and shown **once** on the doctor's screen with a copy button; the doctor
  shares it in person. The patient can change it later in Profile.

Doctors can also **Add existing** (link a self-registered patient by email),
and every patient a doctor runs a diagnostic for is added to their panel
automatically. A doctor sees the **full clinical history** (predictions +
scans, including records made by other doctors) of every panel patient at
`/doctor/patients/{id}`. Patients see all their own records — including
those their doctor recorded — under **My history**.

### RAG chatbot

Question → Gemini embedding → `match_kb_chunks` RPC (cosine similarity) →
top-5 chunks → grounded `gemini-3.5-flash-lite` answer with `[n]` citations
rendered as source chips. The pipeline is LangChain end-to-end:
`DiabAIVectorStore` (a `SupabaseVectorStore` adapter) for retrieval and an
LCEL chain (`prompt | llm | StrOutputParser()`) for generation, with token
usage logged per call. Sessions and messages persist per user. The bot
answers in English or French (matching the question) and never diagnoses.

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

### Security

- Frontend auth via `@supabase/ssr`; Next.js `proxy.ts` guards every private
  route; the `(app)` layout additionally enforces the doctor/patient boundary.
- All API calls carry the Supabase access token; FastAPI verifies it and
  enforces roles (`require_doctor` for predictions, eye scans, panel admin).
- All writes go through the backend with the service-role key; RLS policies
  (`0001_init.sql`) protect direct client reads: patients read only their own
  data, doctors only their panel's; admin endpoints are role-gated
  (`require_admin`) and `gemini_usage` has RLS enabled with no policies
  (backend-only).
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
run a diabetes prediction. Sign in as the patient (temp password) →
**My history** shows the doctor's diagnostic.

## Troubleshooting

| Symptom                        | Fix                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `Supabase is not configured` | Fill`backend/.env` (and `frontend/.env.local`)                                  |
| 401 from API                   | Frontend env missing or token expired — re-login                                   |
| 403 Doctor access only         | Signed in as patient; use a doctor account                                          |
| 503 model not installed        | Add`model.<ext>` to `backend/models_app/<scan>/`                                |
| Chat says KB is empty          | Run`python scripts/ingest_kb.py`                                                  |
| Invite email not arriving      | Supabase free SMTP is rate-limited; use the temp-password method or set custom SMTP |
