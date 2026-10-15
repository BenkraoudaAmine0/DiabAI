"""Doctor ↔ patient panel helpers shared across routers."""

from typing import Iterable

from fastapi import HTTPException

from app.services.supabase_client import execute, get_service_client


def get_profile(user_id: str) -> dict:
    try:
        res = execute(
            lambda: get_service_client()
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return res.data
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Profile not found") from exc


def ensure_panel_link(doctor_id: str, patient_id: str) -> None:
    """Validates the subject is a patient and (re)creates the panel link."""
    profile = get_profile(patient_id)
    if profile.get("role") != "patient":
        raise HTTPException(
            status_code=400, detail="Selected user is not a patient"
        )
    get_service_client().table("doctor_patients").upsert(
        {"doctor_id": doctor_id, "patient_id": patient_id},
        on_conflict="doctor_id,patient_id",
    ).execute()


def has_panel_link(doctor_id: str, patient_id: str) -> bool:
    res = execute(
        lambda: get_service_client()
        .table("doctor_patients")
        .select("doctor_id")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


# ── panel data (dashboard, patient list, search) ──────────────────────────────
PRED_COLUMNS = "id, patient_id, doctor_id, probability, prediction, risk_tier, input, created_at"
SCAN_COLUMNS = "id, patient_id, user_id, scan_type, result, created_at"
IDS_PER_QUERY = 100  # keeps PostgREST `in.(…)` URLs short for large panels
ROW_LIMIT = 1000


def panel(svc, doctor_id: str) -> tuple[list[dict], dict[str, dict]]:
    """(links, {patient_id: profile}) of the doctor's panel."""
    links = (
        execute(
            lambda: svc.table("doctor_patients")
            .select(
                "patient_id, created_at, "
                "profiles!doctor_patients_patient_id_fkey(id, full_name, email, phone, dob, sex)"
            )
            .eq("doctor_id", doctor_id)
            .execute()
        ).data
        or []
    )
    patients = {
        link["patient_id"]: dict(link.get("profiles") or {}, linked_at=link["created_at"])
        for link in links
    }
    return links, patients


def _chunks(ids: list[str]) -> Iterable[list[str]]:
    for start in range(0, len(ids), IDS_PER_QUERY):
        yield ids[start : start + IDS_PER_QUERY]


def predictions_of(svc, ids: list[str], columns: str = PRED_COLUMNS) -> list[dict]:
    """Predictions of these patients, newest first, with the review status
    when migration 0007 is applied."""
    rows: list[dict] = []
    for part in _chunks(ids):
        query = lambda cols: (  # noqa: E731
            svc.table("predictions").select(cols).in_("patient_id", part)
            .order("created_at", desc=True).limit(ROW_LIMIT)
        )
        try:
            rows += execute(lambda: query(columns + ", status").execute()).data or []
        except Exception:  # before 0007: no status column
            rows += execute(lambda: query(columns).execute()).data or []
    return sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)


def scans_of(svc, ids: list[str]) -> list[dict]:
    rows: list[dict] = []
    for part in _chunks(ids):
        rows += (
            execute(
                lambda: svc.table("scans")
                .select(SCAN_COLUMNS)
                .in_("patient_id", part)
                .order("created_at", desc=True)
                .limit(ROW_LIMIT)
                .execute()
            ).data
            or []
        )
    return sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)
