# DiabAI — roles and permissions

DiabAI has three roles, stored in `public.profiles.role`: **patient**,
**doctor** and **admin**. The backend enforces them on every API call
(`app/auth.py`: `get_current_user`, `require_doctor`, `require_admin`), and
the Supabase RLS policies protect direct reads from the browser.

| Role    | How an account gets it                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Patient | Self-registration as "Patient", or created by a doctor (email invitation or temporary password)                  |
| Doctor  | Self-registration as "Doctor"                                                                                    |
| Admin   | Only from the Supabase SQL Editor: `update public.profiles set role = 'admin' where email = 'you@example.com';` |

Since migration `0008_role_hardening.sql`, nobody can give themselves the
admin role: signups can only be doctor or patient, and users can't edit
their own `role` or `email` from the browser.

---

## Admin

The admin has **everything a doctor has** (all clinical tools, patient
panel, prediction review), plus the admin dashboard at `/admin/dashboard`.

### 1. Knowledge base for the AI assistant

The admin is the only role that manages the documents and books the chatbot
answers from. Everything is done **from the web interface** — *Admin
dashboard → Knowledge base* — no command line needed.

**Accepted formats**

| Format            | Extension | Text | Tables                     | Images inside                                    |
| ----------------- | --------- | ---- | -------------------------- | ------------------------------------------------ |
| PDF               | `.pdf`    | ✅   | ✅ ruled tables → Markdown | ✅ figures, charts, photos read by Gemini        |
| PDF scan          | `.pdf`    | ✅ pages transcribed by Gemini (OCR) | ✅ in the transcription | ✅                                |
| Word              | `.docx`   | ✅   | ✅ → Markdown              | ✅ pictures read by Gemini                       |
| EPUB (books)      | `.epub`   | ✅   | ✅ HTML tables → Markdown  | ✅ chapter images read by Gemini                 |
| Plain text        | `.txt`    | ✅   | as written                 | — (a text file can't contain images)             |
| Markdown          | `.md`     | ✅   | ✅ Markdown tables kept    | — (image links aren't followed)                  |

Not accepted: old Word `.doc` (save it as `.docx`), password-protected
PDFs, images uploaded on their own.

**Uploading a document or a book**

1. Pick **Document** or **Book** (books get a larger size limit).
2. Choose the file. Title and author are optional — otherwise they come from
   the file's own metadata, then from its name.
3. Click **Upload**. The API answers immediately; reading, chunking and
   embedding run in the background. The table shows *Processing · n %*, then
   *Ready* (searchable) or *Failed* with the reason.
4. Under each document the admin sees what was found, e.g.
   *3 tables · 5 images read · 2 scanned pages*. "Images skipped" means the
   per-document image limit was reached (see below).

The same file can't be added twice (SHA-256 check). **Re-index** re-runs
the pipeline from the stored original (after a failure, a server restart or
a settings change). **Delete** removes the document, its chunks and the
stored file.

**How tables and images are read**

- **Tables** are turned into Markdown tables and indexed on their own, with
  their caption ("Table 2. Diagnostic criteria"), so the assistant can quote
  a whole table and cite its page. A long table is cut between rows and
  every part repeats the header row.
- **Images** (charts, diagrams, photos, photographed tables) are sent to
  Gemini, which transcribes their text and values and summarises them. That
  description is indexed and cited like text ("figure, p. 12"). Logos and
  decorations are ignored; the same image repeated on every page is read once.
- **Scanned pages** (a page that is only an image) are transcribed by Gemini
  in full, tables included.

**Limits and costs** (`backend/.env`)

| Setting               | Default | Meaning                                                                    |
| --------------------- | ------- | -------------------------------------------------------------------------- |
| `KB_MAX_DOCUMENT_MB`  | 25      | Max size of a document                                                     |
| `KB_MAX_BOOK_MB`      | 100     | Max size of a book (Supabase free plan stores originals up to 50 MB only)  |
| `KB_MAX_VISION_CALLS` | 60      | Max images / scanned pages read by Gemini **per document** (0 = tables only) |
| `KB_MIN_IMAGE_PX`     | 120     | Images smaller than this are ignored (icons, bullets)                      |

Each image read is one Gemini call, counted in the dashboard's usage and
cost. A 300-page scanned book needs `KB_MAX_VISION_CALLS=300` (and some
patience with free-tier rate limits — calls are retried automatically).

The text itself is embedded by a **free local model** on the server
(`EMBEDDING_PROVIDER=local`, about 15 minutes for a 1 100-page book), or by
Gemini (`EMBEDDING_PROVIDER=gemini`). The dashboard shows which one is in
use; a document indexed with the other one is marked *Not searched —
re-index it*. Details: [RAG_ARCHITECTURE.md](RAG_ARCHITECTURE.md#embedding-model-local-by-default).

Good to know: charts drawn as vectors in a PDF (not embedded pictures) are
read through their text labels only; tables without ruling lines in a PDF
are read as running text.

### 2. Monitoring

- Number of doctors, patients and admins; every user with their prediction
  and scan counts.
- Supabase Storage used per bucket (`scans`, `kb-docs`).
- Gemini usage: calls, input / output tokens and estimated cost, split into
  generation (chat, interpretations, image reading) and embeddings. Prices
  per million tokens are set in `backend/.env`.

### 3. Recommended admin duties (not automated yet)

- **Check who registers as a doctor.** Signup is open: anyone can create a
  doctor account, and a doctor can add any patient to their panel by email
  and then read that patient's full history. Until doctor accounts need an
  admin's approval, review the Users table regularly.
- After applying `0008_role_hardening.sql`, check the admin list once:
  `select email, created_at from public.profiles where role = 'admin';`

---

## Doctor

| Can                                                                                       | Where                     |
| ----------------------------------------------------------------------------------------- | ------------------------- |
| Create patient accounts — email invitation or one-time temporary password                 | My patients → New patient |
| Send a patient a new login link or temporary password (expired invite, forgotten password) | patient page → Login access |
| Add an existing patient account to the panel (by email)                                   | My patients → Add existing |
| See the full history of panel patients (predictions + scans, by any doctor)               | My patients → patient     |
| Run a diabetes prediction                                                                 | Diabetes prediction       |
| Read the report: risk gauge, values vs. reference ranges, SHAP factors, AI interpretation | after a prediction        |
| **Confirm** or **reject** a prediction, with a note; change the decision later            | report page               |
| **Modify inputs** and run a new prediction from a report                                  | report page               |
| **Export the report as PDF** (English or French, follows the interface language)         | report page, history      |
| Foot / neck scans for a patient, retinopathy grading (eye — doctors only)                 | Scans, Retinopathy        |
| Use the AI assistant                                                                      | AI assistant              |

A prediction is **pending** until the doctor confirms or rejects it.
Patients only ever see **confirmed** predictions.

## Patient

| Can                                                                           | Where              |
| ----------------------------------------------------------------------------- | ------------------ |
| Activate an account a doctor created: the invitation email opens a page to create a password, then the patient signs in | email link → `/set-password` |
| Reset a forgotten password                                                    | Sign in → Forgot password? |
| Foot and neck self-scans                                                      | Foot scan, Neck scan |
| See own history: scans, and diabetes predictions **confirmed** by a doctor   | My history         |
| Open a confirmed report and download it as PDF (read-only)                    | My history         |
| Use the AI assistant, change password                                         | AI assistant, Profile |
| Get notified when a doctor adds them, confirms a prediction or records a scan | bell icon |

## Permission matrix

| Action                                   | Patient | Doctor | Admin |
| ---------------------------------------- | :-----: | :----: | :---: |
| Self-scans (foot / neck)                 |   ✅    |   ✅   |  ✅   |
| Eye (retinopathy) scan                   |         |   ✅   |  ✅   |
| Run diabetes prediction                  |         |   ✅   |  ✅   |
| Confirm / reject prediction, AI interpretation |   |   ✅   |  ✅   |
| Read prediction report / PDF             | own, confirmed | panel patients | all |
| Create / link patients                   |         |   ✅   |  ✅   |
| AI assistant (chat)                      |   ✅    |   ✅   |  ✅   |
| Upload / re-index / delete KB documents  |         |        |  ✅   |
| Users, storage and Gemini cost dashboard |         |        |  ✅   |
| Grant the admin role                     | — SQL Editor only — | | |
