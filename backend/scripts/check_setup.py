"""Check that DiabAI is set up — read-only, safe to run any time.

    cd backend
    .venv\\Scripts\\python.exe scripts\\check_setup.py      (Windows)
    python scripts/check_setup.py                           (macOS / Linux)

Checks backend/.env and frontend/.env.local, the Supabase connection, the
Supabase Auth settings that break sign-up / sign-in, that migrations
0001-0008 are applied, the storage buckets, the embedding model, the Gemini
key and model names, and the diabetes model. Nothing is created or changed;
only counts are printed, never keys or user data. Exit code 1 if anything
failed.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
FRONTEND = BACKEND.parent / "frontend"
os.chdir(BACKEND)  # app.config reads ".env" from the working directory
sys.path.insert(0, str(BACKEND))

FAIL, WARN, OK, INFO = "FAIL", "WARN", " OK ", "INFO"
counts = {FAIL: 0, WARN: 0}


def report(status: str, what: str, hint: str = "") -> None:
    counts[status] = counts.get(status, 0) + 1
    print(f"[{status}] {what}")
    if hint:
        for line in hint.split("\n"):
            print(f"         -> {line}")


def placeholder(value: str) -> bool:
    return not value or "YOUR-PROJECT" in value or value.startswith("your-")


def read_env_file(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def section(title: str) -> None:
    print(f"\n== {title}")


# ── configuration files ──────────────────────────────────────────────────────
section("Configuration")
from app.config import get_settings  # noqa: E402

s = get_settings()
if not (BACKEND / ".env").exists():
    report(FAIL, "backend/.env is missing",
           "copy backend/.env.example to backend/.env and fill in the values")
backend_ok = True  # Supabase settings usable (Gemini is checked further down)
for name, value in {
    "SUPABASE_URL": s.supabase_url,
    "SUPABASE_ANON_KEY": s.supabase_anon_key,
    "SUPABASE_SERVICE_ROLE_KEY": s.supabase_service_role_key,
}.items():
    if placeholder(value):
        backend_ok = False
        report(FAIL, f"backend/.env: {name} is {'empty' if not value else 'still the example value'}",
               "Supabase -> Project Settings -> API (Project URL, anon / publishable "
               "key, service_role / secret key)")
if backend_ok:
    report(OK, "backend/.env has the Supabase settings")

env_local = FRONTEND / ".env.local"
if not env_local.exists():
    report(FAIL, "frontend/.env.local is missing",
           "copy frontend/.env.example to frontend/.env.local and fill it in")
else:
    front = read_env_file(env_local)
    f_url = front.get("NEXT_PUBLIC_SUPABASE_URL", "")
    f_key = front.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if placeholder(f_url) or placeholder(f_key):
        report(FAIL, "frontend/.env.local still has empty / example Supabase values",
               "sign-up and sign-in can't work until it holds your project URL "
               "and anon key;\nrestart `npm run dev` after editing it")
    elif s.supabase_url and f_url.rstrip("/") != s.supabase_url.rstrip("/"):
        report(FAIL, "frontend and backend point to different Supabase projects",
               "NEXT_PUBLIC_SUPABASE_URL must equal SUPABASE_URL")
    elif s.supabase_anon_key and f_key != s.supabase_anon_key:
        report(WARN, "frontend and backend anon keys differ",
               "use the same anon / publishable key in both files")
    else:
        report(OK, "frontend/.env.local matches the backend's Supabase project")

origins = s.cors_origin_list
if "http://localhost:3000" not in origins:
    report(WARN, f"CORS_ORIGINS doesn't include http://localhost:3000 ({', '.join(origins)})",
           "the browser will block API calls from the dev frontend")

if not backend_ok:
    print("\nFix backend/.env first — the Supabase checks need it.")

# ── Supabase ─────────────────────────────────────────────────────────────────
if backend_ok:
    section("Supabase Auth (sign-up / sign-in)")
    try:
        req = urllib.request.Request(
            f"{s.supabase_url.rstrip('/')}/auth/v1/settings",
            headers={"apikey": s.supabase_anon_key},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            auth = json.loads(resp.read())
        if not (auth.get("external") or {}).get("email", False):
            report(FAIL, "the Email provider is disabled",
                   "Authentication -> Sign In / Providers -> Email -> enable")
        elif auth.get("disable_signup"):
            report(FAIL, "new sign-ups are disabled",
                   "Authentication -> Sign In / Providers -> allow new users to sign up")
        else:
            report(OK, "email sign-up and sign-in are enabled")
        if not auth.get("mailer_autoconfirm"):
            report(WARN, "'Confirm email' is ON: a new account can't sign in before "
                   "clicking the link in its confirmation email",
                   "Supabase's built-in email only reaches your project's team "
                   "members (and only a few emails per hour),\nso other addresses "
                   "never get the link. For development: Authentication -> Sign In / "
                   "Providers -> Email -> turn off 'Confirm email'.\nFor real users: "
                   "Authentication -> Emails -> SMTP settings (custom SMTP). This "
                   "also affects patient invitations.")
        else:
            report(OK, "'Confirm email' is off — new accounts can sign in at once")
    except urllib.error.HTTPError as exc:
        report(FAIL, f"Supabase Auth answered HTTP {exc.code}",
               "check SUPABASE_URL and SUPABASE_ANON_KEY")
    except Exception as exc:
        report(FAIL, f"can't reach {s.supabase_url}: {exc.__class__.__name__}",
               "check SUPABASE_URL and your internet connection")

    section("Database (migrations)")
    from app.services.supabase_client import get_service_client

    svc = get_service_client()
    probes = [
        ("0001", "profiles", "id, role, created_by"),
        ("0001", "doctor_patients", "doctor_id"),
        ("0001", "predictions", "id, top_factors"),
        ("0001", "scans", "id"),
        ("0001", "chat_sessions", "id"),
        ("0001", "chat_messages", "id, sources"),
        ("0001", "kb_documents", "id"),
        ("0001", "kb_chunks", "id"),
        ("0002", "gemini_usage", "id"),
        ("0004", "kb_documents", "status, sha256, chunks_embedded"),
        ("0004", "kb_chunks", "metadata"),
        ("0005", "kb_documents", "extraction"),
        ("0006", "predictions", "status, interpretation, reviewed_by"),
        ("0008", "kb_documents", "embedding_model"),
    ]
    missing: dict[str, str] = {}
    for migration, table, columns in probes:
        if migration in missing:
            continue
        try:
            svc.table(table).select(columns).limit(1).execute()
        except Exception as exc:
            text = str(exc)
            if "Invalid API key" in text or "JWT" in text or "401" in text:
                report(FAIL, "SUPABASE_SERVICE_ROLE_KEY is rejected",
                       "copy the service_role / secret key again (Project Settings -> API)")
                missing = {"key": "x"}
                break
            missing[migration] = f"{table}({columns}): {text[:120]}"
    if "key" not in missing:
        for migration, rpc in (("0004", "match_kb_chunks_v2"), ("0008", "match_kb_chunks_v3")):
            try:
                svc.rpc(rpc, {"query_embedding": [0.0] * s.embedding_dimensions,
                              "match_count": 1}).execute()
            except Exception as exc:
                missing.setdefault(migration, f"{rpc}: {str(exc)[:120]}")
        names = {
            "0001": "0001_init.sql", "0002": "0002_admin.sql",
            "0004": "0004_kb_uploads.sql", "0005": "0005_kb_rich_content.sql",
            "0006": "0006_prediction_review.sql", "0008": "0008_embedding_model.sql",
        }
        for migration, file in names.items():
            if migration in missing:
                report(FAIL, f"migration {file} is not applied ({missing[migration]})",
                       f"Supabase -> SQL Editor -> paste backend/supabase/migrations/{file} -> Run")
            else:
                report(OK, f"migration {file}")
        report(INFO, "0003_kb_index.sql and 0007_role_hardening.sql can't be checked "
               "from the API — make sure you ran them (0007 before 0008)")

        section("Accounts and storage")
        try:
            profiles = svc.table("profiles").select("id, role").execute().data or []
            roles = {r: sum(1 for p in profiles if p.get("role") == r)
                     for r in ("admin", "doctor", "patient")}
            report(INFO, f"profiles: {roles['admin']} admin, {roles['doctor']} doctors, "
                   f"{roles['patient']} patients")
            users = svc.auth.admin.list_users(page=1, per_page=1000)
            ids = {p["id"] for p in profiles}
            orphans = sum(1 for u in users if str(u.id) not in ids)
            if orphans:
                report(WARN, f"{orphans} account(s) have no profile — they sign in but the "
                       "app can't load them",
                       "created before migration 0001 ran; 0007_role_hardening.sql "
                       "creates the missing profiles")
            else:
                report(OK, f"every account ({len(users)}) has a profile")
            if roles["admin"] == 0:
                report(INFO, "no admin yet: update public.profiles set role = 'admin' "
                       "where email = 'you@example.com';")
        except Exception as exc:
            report(WARN, f"couldn't count accounts: {exc.__class__.__name__}: {str(exc)[:120]}")
        try:
            from app.services import embeddings

            docs = (svc.table("kb_documents").select("embedding_model")
                    .eq("status", "ready").execute().data or [])
            other = sum(1 for d in docs if d.get("embedding_model") != embeddings.model_id())
            if other:
                report(WARN, f"{other} of {len(docs)} knowledge-base document(s) were embedded "
                       f"by another model than {embeddings.model_id()} — the chatbot skips them",
                       "re-index them: admin dashboard -> Knowledge base -> Re-index,\n"
                       "or `python scripts/ingest_kb.py <files>`")
            else:
                report(OK, f"knowledge base: {len(docs)} document(s) ready, all searchable")
        except Exception:
            pass  # 0008 missing: already reported above
        try:
            buckets = {b.name for b in svc.storage.list_buckets()}
            for bucket in ("scans", "kb-docs"):
                if bucket in buckets:
                    report(OK, f"storage bucket '{bucket}'")
                else:
                    report(FAIL, f"storage bucket '{bucket}' is missing",
                           "it is created by 0001_init.sql")
        except Exception as exc:
            report(WARN, f"couldn't list storage buckets: {str(exc)[:120]}")

# ── Gemini ───────────────────────────────────────────────────────────────────
section("Gemini")
if placeholder(s.gemini_api_key):
    report(FAIL, "GEMINI_API_KEY is not set — chat, interpretations and uploads won't work")
else:
    try:
        from google import genai

        client = genai.Client(api_key=s.gemini_api_key)
        to_check = [("GEMINI_MODEL", s.gemini_model)]
        if s.embedding_provider == "gemini":
            to_check.append(("GEMINI_EMBEDDING_MODEL", s.gemini_embedding_model))
        for setting, model in to_check:
            try:
                client.models.get(model=model)  # metadata only, no tokens used
                report(OK, f"{setting} = {model}")
            except Exception as exc:
                text = str(exc)
                if "API key" in text or "PERMISSION_DENIED" in text or "401" in text:
                    report(FAIL, "GEMINI_API_KEY is rejected", "create a key at https://aistudio.google.com/apikey")
                    break
                report(FAIL, f"{setting} = {model} doesn't exist for this key ({text[:100]})",
                       "pick a model name listed in Google AI Studio")
    except Exception as exc:
        report(FAIL, f"Gemini check failed: {exc.__class__.__name__}: {str(exc)[:120]}")

# ── embeddings ───────────────────────────────────────────────────────────────
section("Embeddings (knowledge base)")
if s.embedding_provider not in ("local", "gemini"):
    report(FAIL, f"EMBEDDING_PROVIDER='{s.embedding_provider}'", "use 'local' or 'gemini'")
elif s.embedding_provider == "gemini":
    report(INFO, f"Gemini embeddings ({s.gemini_embedding_model}) — free tier ≈ 1 000 "
           "requests/day: a large book may take several days to index")
else:
    try:
        import fastembed  # noqa: F401

        cache = Path(s.local_embedding_dir)
        cache = cache if cache.is_absolute() else BACKEND / cache
        downloaded = cache.exists() and any(cache.rglob("*.onnx*"))
        report(OK, f"local embeddings: {s.local_embedding_model}"
               + ("" if downloaded else " (downloads ~1.2 GB at the API's first start)"))
    except ImportError:
        report(FAIL, "EMBEDDING_PROVIDER=local but fastembed isn't installed",
               ".venv\\Scripts\\python.exe -m pip install -r requirements.txt")

# ── ML model ─────────────────────────────────────────────────────────────────
section("Diabetes model")
try:
    from app.services import diabetes_service

    diabetes_service._load()
    report(OK, "models_app/diabetes artifacts load")
except Exception as exc:
    report(FAIL, f"diabetes model: {exc.__class__.__name__}: {str(exc)[:160]}")

print(f"\n{counts[FAIL]} problem(s), {counts[WARN]} warning(s).")
sys.exit(1 if counts[FAIL] else 0)
