"""Admin endpoints — models & system (Figma 05 Admin Screens): model
registry (versions, status, metrics) next to the model files actually found
on this server, and live health checks with request metrics."""

import hashlib
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import AuthUser, require_admin
from app.config import get_settings
from app.services import diabetes_service, embeddings, metrics, vision_service
from app.services.audit_service import audit_by
from app.services.supabase_client import get_service_client

router = APIRouter()

MIGRATION_0013 = "Apply backend/supabase/migrations/0013_admin_security.sql first."
Task = Literal["diabetes_risk", "retina", "foot", "neck", "embeddings", "llm", "other"]
Status = Literal["candidate", "staging", "validated", "production", "monitoring", "retired"]
REVIEW_STATUSES = ("candidate", "staging", "monitoring")
VISION_TASK = {"eye": "retina", "foot": "foot", "neck": "neck"}

_hashes: dict[tuple[str, float, int], str] = {}


def _sha256(path: Path) -> str:
    """Content hash of a model file (cached until the file changes)."""
    stat = path.stat()
    key = (str(path), stat.st_mtime, stat.st_size)
    if key not in _hashes:
        digest = hashlib.sha256()
        with path.open("rb") as fh:
            for block in iter(lambda: fh.read(1 << 20), b""):
                digest.update(block)
        _hashes[key] = digest.hexdigest()
    return _hashes[key]


def _file_info(path: Path) -> dict:
    stat = path.stat()
    return {
        "artifact": path.name,
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "sha256": _sha256(path),
    }


def detected_models() -> list[dict]:
    """What this API server can actually run right now."""
    s = get_settings()
    out: list[dict] = []
    main = diabetes_service.DIABETES_DIR / diabetes_service.REQUIRED_FILES[0]
    missing = [f for f in diabetes_service.REQUIRED_FILES if not (diabetes_service.DIABETES_DIR / f).exists()]
    entry = {"key": "diabetes", "task": "diabetes_risk", "loaded": not missing, "missing": missing}
    if main.exists():
        entry.update(_file_info(main))
        try:
            entry["threshold"] = round(diabetes_service.decision_threshold(), 4)
        except Exception:
            pass
    out.append(entry)

    vision_avail = vision_service.availability()
    for scan_type in vision_service.SCAN_TYPES:
        found = vision_service._find_model_file(scan_type)
        is_avail = found is not None or vision_avail.get(scan_type, False)
        entry = {"key": scan_type, "task": VISION_TASK[scan_type], "loaded": is_avail}
        if found is not None:
            entry.update(_file_info(found))
        elif is_avail and s.hf_vision_space:
            entry.update({
                "artifact": f"hf:{s.hf_vision_space}/{scan_type}",
            })
        out.append(entry)

    out.append({"key": "embeddings", "task": "embeddings", "loaded": True, "artifact": embeddings.model_id()})
    out.append({"key": "llm", "task": "llm", "loaded": bool(s.gemini_api_key), "artifact": f"gemini:{s.gemini_model}"})
    return out


def _registry(svc) -> list[dict]:
    return (
        svc.table("model_registry")
        .select("id, name, version, task, status, metrics, artifact, sha256, notes, created_at, updated_at")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )


def registry_summary(svc) -> dict:
    """Overview card: production models first, else what the server runs."""
    try:
        rows = _registry(svc)
    except Exception:
        rows = []
    order = {"production": 0, "validated": 1, "staging": 2, "monitoring": 3, "candidate": 4, "retired": 5}
    rows.sort(key=lambda r: order.get(r["status"], 9))
    return {"registry": rows[:3], "detected": [d for d in detected_models() if d["loaded"]][:3]}


@router.get("/models")
def models(user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()
    try:
        rows = _registry(svc)
        available = True
    except Exception:
        rows, available = [], False
    detected = detected_models()
    by_hash = {r["sha256"]: r for r in rows if r.get("sha256")}
    by_file = {r["artifact"]: r for r in rows if r.get("artifact")}
    for d in detected:
        match = by_hash.get(d.get("sha256") or "") or by_file.get(d.get("artifact") or "")
        d["registered_as"] = {"id": match["id"], "name": match["name"], "version": match["version"], "status": match["status"]} if match else None
    return {
        "registry": rows,
        "detected": detected,
        "summary": {
            "registered": len(rows),
            "production": sum(1 for r in rows if r["status"] == "production"),
            "needs_review": sum(1 for r in rows if r["status"] in REVIEW_STATUSES),
            "loaded": sum(1 for d in detected if d["loaded"]),
            "expected": len(detected),
        },
        "registry_available": available,
    }


Metric = Union[float, str]


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=40)
    task: Task = "other"
    status: Status = "candidate"
    metrics: dict[str, Metric] = Field(default_factory=dict, max_length=12)
    artifact: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=2000)


@router.post("/models", status_code=201)
def register_model(req: ModelCreate, user: AuthUser = Depends(require_admin)) -> dict:
    row = req.model_dump()
    # link to the file on this server when the artifact name matches one
    for d in detected_models():
        if req.artifact and d.get("artifact") == req.artifact and d.get("sha256"):
            row["sha256"] = d["sha256"]
    row["registered_by"] = user.id
    try:
        res = get_service_client().table("model_registry").insert(row).execute()
    except Exception as exc:
        text = str(exc)
        if "duplicate" in text or "23505" in text:
            raise HTTPException(status_code=409, detail="This name and version are already registered.") from exc
        raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
    created = (res.data or [row])[0]
    audit_by(user, "model.register", "model", created.get("id"), {"name": req.name, "version": req.version, "status": req.status})
    return created


class ModelUpdate(BaseModel):
    status: Optional[Status] = None
    metrics: Optional[dict[str, Metric]] = Field(default=None, max_length=12)
    notes: Optional[str] = Field(default=None, max_length=2000)


@router.put("/models/{model_id}")
def update_model(model_id: UUID, req: ModelUpdate, user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()
    rows = svc.table("model_registry").select("id, name, version, status").eq("id", str(model_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Model not found")
    changes = {k: v for k, v in req.model_dump().items() if v is not None}
    if not changes:
        return rows[0]
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    svc.table("model_registry").update(changes).eq("id", str(model_id)).execute()
    detail = {"name": rows[0]["name"], "version": rows[0]["version"]}
    if req.status and req.status != rows[0]["status"]:
        detail.update({"from": rows[0]["status"], "to": req.status})
    audit_by(user, "model.update", "model", str(model_id), detail)
    return dict(rows[0], **changes)


# ── system health ────────────────────────────────────────────────────────────

def _timed(fn) -> tuple[bool, float, Optional[str]]:
    start = time.perf_counter()
    try:
        fn()
        return True, round((time.perf_counter() - start) * 1000, 1), None
    except Exception as exc:
        return False, round((time.perf_counter() - start) * 1000, 1), str(exc)[:200]


def _service_of(source: str, message: str) -> str:
    text = f"{source} {message}".lower()
    if "/api/diabetes/predict" in text or "/api/scan" in text or "model" in text:
        return "ml"
    if "/api/chat" in text or "interpretation" in text or "gemini" in text or "kb." in text or "/api/admin/kb" in text:
        return "ai"
    if "postgrest" in text or "pgrst" in text or "database" in text or "supabase" in text:
        return "database"
    return "api"


def health_checks(svc, quick: bool = False) -> dict:
    s = get_settings()
    db_ok, db_ms, db_err = _timed(lambda: svc.table("profiles").select("id").limit(1).execute())
    st_ok, st_ms, st_err = _timed(lambda: svc.storage.from_("scans").list("", {"limit": 1}))
    snap = metrics.snapshot()
    detected = detected_models()
    ml = [d for d in detected if d["task"] in ("diabetes_risk", "retina", "foot", "neck")]

    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    try:
        errors = (
            svc.table("app_errors").select("id, level, status, source, message, detail, created_at, resolved_at")
            .gte("created_at", since).order("created_at", desc=True).limit(2000).execute().data or []
        )
    except Exception:
        errors = []
    incidents: dict[str, int] = {"api": 0, "database": 0, "ml": 0, "ai": 0}
    unresolved: dict[str, int] = {"api": 0, "database": 0, "ml": 0, "ai": 0}
    for e in errors:
        svc_name = _service_of(e["source"], e["message"])
        if e["level"] in ("high", "critical"):
            incidents[svc_name] += 1
            if e["status"] != "resolved":
                unresolved[svc_name] += 1

    def status(ok: bool, name: str) -> str:
        if not ok:
            return "down"
        return "degraded" if unresolved[name] else "operational"

    try:
        day = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        usage = svc.table("gemini_usage").select("estimated_cost_usd, created_at").gte("created_at", day).limit(20000).execute().data or []
        last = svc.table("gemini_usage").select("created_at").order("created_at", desc=True).limit(1).execute().data or []
    except Exception:
        usage, last = [], []

    out = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "services": {
            "api": {
                "status": status(True, "api"),
                "uptime_seconds": snap["uptime_seconds"],
                "p95_ms": snap["api_p95_ms"],
                "requests_per_minute": snap["requests_per_minute"],
                "incidents_30d": incidents["api"],
            },
            "database": {
                "status": status(db_ok, "database"),
                "latency_ms": db_ms,
                "storage_ok": st_ok,
                "storage_latency_ms": st_ms,
                "error": db_err or st_err,
                "incidents_30d": incidents["database"],
            },
            "ml": {
                "status": status(any(d["loaded"] for d in ml), "ml"),
                "loaded": sum(1 for d in ml if d["loaded"]),
                "total": len(ml),
                "models": {d["key"]: d["loaded"] for d in ml},
                "p95_ms": snap["ml_p95_ms"],
                "incidents_30d": incidents["ml"],
            },
            "ai": {
                "status": status(bool(s.gemini_api_key), "ai"),
                "configured": bool(s.gemini_api_key),
                "model": s.gemini_model,
                "embeddings": embeddings.model_id(),
                "calls_24h": len(usage),
                "cost_24h_usd": round(sum(float(u.get("estimated_cost_usd") or 0) for u in usage), 4),
                "last_call": last[0]["created_at"] if last else None,
                "incidents_30d": incidents["ai"],
            },
        },
        "incidents": [
            dict(e, service=_service_of(e["source"], e["message"]))
            for e in errors if e["level"] in ("high", "critical")
        ][:5],
    }
    if not quick:
        out["traffic"] = snap
    return out


@router.get("/health")
def system_health(user: AuthUser = Depends(require_admin)) -> dict:
    return health_checks(get_service_client())
