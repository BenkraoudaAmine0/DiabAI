"""DiabAI FastAPI entrypoint."""

import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.routers import (
    admin,
    admin_security,
    admin_system,
    chat,
    dashboard,
    me,
    diabetes,
    kb,
    notifications,
    patients,
    records,
    vision,
)
from app.services import diabetes_service, embeddings, kb_ingest_service, metrics, vision_service
from app.services.audit_service import log_error


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure models exist locally (downloads from private Hugging Face repo if missing)
    settings = get_settings()
    if settings.hf_token:
        import os
        os.environ.setdefault("HF_TOKEN", settings.hf_token)

    try:
        from scripts.download_models import ensure_models
        ensure_models(token=settings.hf_token or None, repo_id=settings.hf_model_repo_id)
    except Exception as exc:
        print(f"[startup] model sync from HF skipped/failed: {exc}")

    # Report model availability at boot — never crash, the app must run even
    # before the user drops their trained vision models into models_app/.
    try:
        diabetes_service._load()
        print("[startup] diabetes model: OK "
              f"({', '.join(diabetes_service.REQUIRED_FILES)})")
    except Exception as exc:
        print(f"[startup] diabetes model: MISSING — {exc}")


    for scan_type, ok in vision_service.availability().items():
        state = "OK" if ok else "not installed (503 until added)"
        print(f"[startup] vision/{scan_type}: {state}")

    # The local embedding model takes seconds to load (and downloads ~1.2 GB
    # the first time): load it in the background so the API is up at once.
    print(f"[startup] embeddings: {embeddings.model_id()}")
    if embeddings.is_local():
        def warm_up() -> None:
            try:
                embeddings.get_embeddings()
                print("[startup] embeddings: local model ready")
            except Exception as exc:
                print(f"[startup] embeddings: local model unavailable — {exc}")

        threading.Thread(target=warm_up, daemon=True).start()

    # Knowledge-base uploads cut off by the last shutdown can't resume
    # (background tasks live in this process) — flag them for re-index.
    try:
        n = kb_ingest_service.fail_interrupted()
        if n:
            print(f"[startup] knowledge base: {n} interrupted upload(s) "
                  "marked failed — re-index them from the admin dashboard")
    except Exception as exc:
        print(f"[startup] knowledge base: status check skipped — {exc} "
              "(is migration 0005 applied?)")
    yield


app = FastAPI(
    title="DiabAI API",
    version="1.0.0",
    description="Diabetes prediction, complication screening (foot/neck/eye) "
    "and RAG chatbot.",
    lifespan=lifespan,
)

s = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=s.cors_origin_list or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def request_metrics(request: Request, call_next):
    """Requests/min and latency for the admin "System health" page."""
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        metrics.record(request.url.path, status, (time.perf_counter() - start) * 1000)


@app.exception_handler(StarletteHTTPException)
async def log_server_errors(request: Request, exc: StarletteHTTPException):
    """5xx answers become error alerts (503 = a model or key is missing)."""
    if exc.status_code >= 500:
        await run_in_threadpool(
            log_error,
            f"{request.method} {request.url.path}",
            str(exc.detail),
            "medium" if exc.status_code == 503 else "high",
            {"status": exc.status_code},
        )
    return await http_exception_handler(request, exc)


@app.exception_handler(Exception)
async def log_crashes(request: Request, exc: Exception):
    await run_in_threadpool(
        log_error,
        f"{request.method} {request.url.path}",
        f"{type(exc).__name__}: {exc}",
        "critical",
        {"status": 500},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(diabetes.router, prefix="/api/diabetes", tags=["diabetes"])
app.include_router(vision.router, prefix="/api", tags=["vision"])
app.include_router(patients.router, prefix="/api/patients", tags=["patients"])
app.include_router(records.router, prefix="/api/records", tags=["records"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_security.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_system.router, prefix="/api/admin", tags=["admin"])
app.include_router(me.router, prefix="/api/me", tags=["me"])
app.include_router(kb.router, prefix="/api/admin/kb", tags=["knowledge-base"])
app.include_router(
    notifications.router, prefix="/api/notifications", tags=["notifications"]
)


@app.api_route("/", methods=["GET", "HEAD"])
def root() -> dict:
    return {
        "status": "ok",
        "service": "DiabAI API",
        "version": app.version,
        "docs": "/docs",
        "health": "/api/health",
    }


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health() -> dict:

    return {
        "status": "ok",
        "version": app.version,
        "environment": get_settings().app_env,
        "models": {
            "diabetes": True,
            **vision_service.availability(),
        },
    }

