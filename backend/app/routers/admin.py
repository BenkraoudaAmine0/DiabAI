"""Admin endpoints — see doctors & patients, storage usage, Gemini usage/cost."""

from fastapi import APIRouter, Depends, Query

from app.auth import AuthUser, require_admin
from app.services.supabase_client import get_service_client

router = APIRouter()


def _count(svc, role: str) -> int:
    res = (
        svc.table("profiles")
        .select("id", count="exact")
        .eq("role", role)
        .limit(1)
        .execute()
    )
    return res.count or 0


def _bucket_usage(svc, bucket: str) -> dict:
    """Recursive size/count of a private bucket via the Storage list API."""
    objects = 0
    total_bytes = 0

    def walk(path: str) -> None:
        nonlocal objects, total_bytes
        try:
            items = svc.storage.from_(bucket).list(path) or []
        except Exception:
            return
        for item in items:
            name = item.get("name", "")
            if not name:
                continue
            meta = item.get("metadata")
            if meta is None:  # folder
                walk(f"{path}/{name}".strip("/"))
            else:
                objects += 1
                total_bytes += int(meta.get("size") or 0)

    walk("")
    return {"objects": objects, "bytes": total_bytes}


def _usage_summary(rows: list[dict]) -> dict:
    return {
        "calls": len(rows),
        "input_tokens": sum(int(r.get("input_tokens") or 0) for r in rows),
        "output_tokens": sum(int(r.get("output_tokens") or 0) for r in rows),
        "estimated_cost_usd": round(
            sum(float(r.get("estimated_cost_usd") or 0) for r in rows), 4
        ),
    }


@router.get("/stats")
def admin_stats(user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()

    counts = {
        "doctors": _count(svc, "doctor"),
        "patients": _count(svc, "patient"),
        "admins": _count(svc, "admin"),
    }

    storage = {
        "scans": _bucket_usage(svc, "scans"),
        "kb-docs": _bucket_usage(svc, "kb-docs"),
    }

    usage_rows = (
        svc.table("gemini_usage")
        .select(
            "kind, model, input_tokens, output_tokens, estimated_cost_usd, created_at"
        )
        .order("created_at", desc=True)
        .limit(20000)
        .execute()
        .data
        or []
    )
    generate_rows = [r for r in usage_rows if r.get("kind") == "generate"]
    embedding_rows = [r for r in usage_rows if r.get("kind") == "embedding"]

    return {
        "counts": counts,
        "storage": storage,
        "gemini": {
            "totals": _usage_summary(usage_rows),
            "generate": _usage_summary(generate_rows),
            "embedding": _usage_summary(embedding_rows),
            "last_call": usage_rows[0].get("created_at") if usage_rows else None,
        },
    }


@router.get("/users")
def admin_users(
    role: str | None = Query(default=None),
    user: AuthUser = Depends(require_admin),
) -> dict:
    svc = get_service_client()

    query = (
        svc.table("profiles")
        .select("id, email, full_name, role, created_at")
        .order("created_at", desc=True)
        .limit(500)
    )
    if role in ("doctor", "patient", "admin"):
        query = query.eq("role", role)
    profiles = query.execute().data or []

    # per-user record counts
    preds = (
        svc.table("predictions").select("doctor_id, patient_id").execute().data or []
    )
    scans = svc.table("scans").select("user_id, patient_id").execute().data or []

    counts: dict[str, dict] = {
        p["id"]: {
            "predictions_made": 0,
            "predictions_received": 0,
            "scans_performed": 0,
            "scans_received": 0,
        }
        for p in profiles
    }
    for r in preds:
        if r.get("doctor_id") in counts:
            counts[r["doctor_id"]]["predictions_made"] += 1
        if r.get("patient_id") in counts:
            counts[r["patient_id"]]["predictions_received"] += 1
    for r in scans:
        if r.get("user_id") in counts:
            counts[r["user_id"]]["scans_performed"] += 1
        if r.get("patient_id") in counts:
            counts[r["patient_id"]]["scans_received"] += 1

    return {
        "users": [dict(p, counts=counts.get(p["id"], {})) for p in profiles]
    }
