"""DiabAI FastAPI entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    admin,
    chat,
    diabetes,
    notifications,
    patients,
    records,
    vision,
)
from app.services import diabetes_service, vision_service


@asynccontextmanager
async def lifespan(app: FastAPI):
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

app.include_router(diabetes.router, prefix="/api/diabetes", tags=["diabetes"])
app.include_router(vision.router, prefix="/api", tags=["vision"])
app.include_router(patients.router, prefix="/api/patients", tags=["patients"])
app.include_router(records.router, prefix="/api/records", tags=["records"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(
    notifications.router, prefix="/api/notifications", tags=["notifications"]
)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "models": {
            "diabetes": True,
            **vision_service.availability(),
        },
    }
