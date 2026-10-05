"""Doctor's patient panel: create patient accounts, link existing ones,
list the panel, and read a patient's full diagnostic history."""

import secrets
import string
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import AuthUser, require_doctor
from app.schemas import (
    CreatePatientRequest,
    CreatePatientResponse,
    IdentifiersRequest,
    LinkPatientRequest,
    NextVisitRequest,
    NoteRequest,
    PatientCredentialsRequest,
    VitalsRequest,
)
from app.services.notification_service import notify
from app.services.audit_service import audit_by
from app.services.clinical import age_from, clinical_status
from app.services.panel import (
    get_profile,
    has_panel_link,
    panel,
    predictions_of,
    scans_of,
)
from app.services.supabase_client import (
    get_anon_client,
    get_service_client,
    signed_url,
)

router = APIRouter()

BUCKET = "scans"


def _generate_password(length: int = 12) -> str:
    """Readable-but-strong password: guaranteed lower/upper/digit/symbol."""
    lower = string.ascii_lowercase
    upper = string.ascii_uppercase
    digits = string.digits
    symbols = "!@#$%&*"
    pool = lower + upper + digits + symbols
    while True:
        pwd = "".join(secrets.choice(pool) for _ in range(length))
        if (
            any(c in lower for c in pwd)
            and any(c in upper for c in pwd)
            and any(c in digits for c in pwd)
            and any(c in symbols for c in pwd)
        ):
            return pwd


def _is_duplicate(err: Exception) -> bool:
    msg = str(err).lower()
    return "already" in msg or "registered" in msg or "exists" in msg


def _duplicate_response(svc, email: str, doctor_id: str) -> HTTPException:
    """Duplicate email — tailor the message to the doctor's relationship
    with the existing account."""
    try:
        rows = (
            svc.table("profiles")
            .select("id, role")
            .eq("email", email)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []
    if rows and rows[0].get("role") == "patient" and has_panel_link(
        doctor_id, rows[0]["id"]
    ):
        return HTTPException(
            status_code=409,
            detail="This patient is already in your panel — open their "
            "page and use 'Login access' to send a new login link or "
            "set a temporary password.",
        )
    return HTTPException(
        status_code=409,
        detail="An account with this email already exists — use "
        "'Add existing patient' instead.",
    )


def _upsert_patient_profile(
    patient_id: str,
    req: CreatePatientRequest,
    doctor_id: str,
    doctor_name: str,
) -> None:
    get_service_client().table("profiles").upsert(
        {
            "id": patient_id,
            "email": req.email,
            "role": "patient",
            "full_name": req.full_name,
            "dob": req.dob.isoformat() if req.dob else None,
            "sex": req.sex,
            "phone": req.phone,
            "created_by": doctor_id,
        },
        on_conflict="id",
    ).execute()
    get_service_client().table("doctor_patients").upsert(
        {"doctor_id": doctor_id, "patient_id": patient_id},
        on_conflict="doctor_id,patient_id",
    ).execute()
    notify(
        patient_id,
        "panel_added",
        {"doctor": doctor_name},
        link="/patient",
        actor_id=doctor_id,
    )


@router.post("", response_model=CreatePatientResponse)
def create_patient(
    req: CreatePatientRequest, user: AuthUser = Depends(require_doctor)
) -> CreatePatientResponse:
    """Create a patient account. `invite` emails a set-password link;
    `temp_password` returns a generated password ONCE (doctor shares it)."""
    svc = get_service_client()

    if req.method == "invite":
        from app.config import get_settings

        redirect_to = (
            f"{get_settings().frontend_url}/auth/callback?next=/set-password"
        )
        try:
            res = svc.auth.admin.invite_user_by_email(
                req.email, options={"redirect_to": redirect_to}
            )
        except Exception as exc:
            if _is_duplicate(exc):
                raise _duplicate_response(svc, req.email, user.id) from exc
            raise HTTPException(
                status_code=502,
                detail=f"Supabase invite failed: {exc}",
            ) from exc
        patient_id = str(res.user.id)
        _upsert_patient_profile(patient_id, req, user.id, user.full_name or "Your doctor")
        audit_by(user, "patient.create", "profile", patient_id, {"method": "invite"})
        return CreatePatientResponse(
            patient_id=UUID(patient_id),
            method="invite",
            email=req.email,
            message="Invitation sent — the patient sets their own password "
            "from the link in the email.",
        )

    # temp_password
    temp_password = _generate_password()
    try:
        res = svc.auth.admin.create_user(
            {
                "email": req.email,
                "password": temp_password,
                "email_confirm": True,
                "user_metadata": {"full_name": req.full_name, "role": "patient"},
            }
        )
    except Exception as exc:
        if _is_duplicate(exc):
            raise _duplicate_response(svc, req.email, user.id) from exc
        raise HTTPException(
            status_code=502, detail=f"Supabase user creation failed: {exc}"
        ) from exc

    patient_id = str(res.user.id)
    _upsert_patient_profile(patient_id, req, user.id, user.full_name or "Your doctor")
    audit_by(user, "patient.create", "profile", patient_id, {"method": "temp_password"})
    return CreatePatientResponse(
        patient_id=UUID(patient_id),
        method="temp_password",
        email=req.email,
        temp_password=temp_password,
        message="Account created. Share this password with the patient now — "
        "it is shown only once. The patient can change it from their profile.",
    )


@router.post("/{patient_id}/credentials")
def send_patient_credentials(
    patient_id: UUID,
    req: PatientCredentialsRequest,
    user: AuthUser = Depends(require_doctor),
) -> dict:
    """Re-grant access to an EXISTING panel patient whose invite link
    expired or who forgot their password.

    login_link   → magic-link email that signs the patient in so they can
                   set a new password on /set-password (no password needed)
    temp_password → admin sets a generated password (shown ONCE); also
                   confirms unconfirmed emails, unblocking self-registered
                   patients stuck on 'confirm your email'.
    """
    pid = str(patient_id)
    if not has_panel_link(user.id, pid):
        raise HTTPException(
            status_code=403, detail="This patient is not in your panel."
        )
    profile = get_profile(pid)
    email = profile.get("email")
    if not email:
        raise HTTPException(
            status_code=400, detail="This account has no email address."
        )

    if req.method == "login_link":
        from app.config import get_settings

        redirect_to = (
            f"{get_settings().frontend_url}/auth/callback?next=/set-password"
        )
        try:
            get_anon_client().auth.sign_in_with_otp(
                {
                    "email": email,
                    "options": {"email_redirect_to": redirect_to},
                }
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Could not send the login link: {exc}",
            ) from exc
        audit_by(user, "patient.credentials", "profile", pid, {"method": "login_link"})
        return {
            "method": "login_link",
            "email": email,
            "message": f"Login link sent to {email} — it signs the patient "
            "in so they can set a new password.",
        }

    # temp_password — also confirms the email, unblocking stuck signups
    temp = _generate_password()
    try:
        get_service_client().auth.admin.update_user_by_id(
            pid, {"password": temp, "email_confirm": True}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not update the password: {exc}"
        ) from exc
    audit_by(user, "patient.credentials", "profile", pid, {"method": "temp_password"})
    return {
        "method": "temp_password",
        "email": email,
        "temp_password": temp,
        "message": "New temporary password set — share it now, it is shown "
        "only once. The patient can change it from their profile.",
    }


@router.post("/link")
def link_patient(
    req: LinkPatientRequest, user: AuthUser = Depends(require_doctor)
) -> dict:
    """Add an existing (self-registered) patient to the doctor's panel."""
    res = (
        get_service_client()
        .table("profiles")
        .select("id, email, full_name, role")
        .eq("email", req.email)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No account found with this email. Use 'Create patient' "
            "to register them first.",
        )
    profile = rows[0]
    if profile.get("role") != "patient":
        raise HTTPException(
            status_code=400, detail="This account is not a patient."
        )
    get_service_client().table("doctor_patients").upsert(
        {"doctor_id": user.id, "patient_id": profile["id"]},
        on_conflict="doctor_id,patient_id",
    ).execute()
    notify(
        profile["id"],
        "panel_added",
        {"doctor": user.full_name or "Your doctor"},
        link="/patient",
        actor_id=user.id,
    )
    audit_by(user, "patient.link", "profile", profile["id"])
    return {"linked": True, "patient": profile}


def _panel_rows(svc, doctor_id: str) -> list[dict]:
    """The doctor's panel, newest link first, each patient with: record
    counts, age, latest prediction (+ clinical status), last activity date
    and the number of predictions waiting for review."""
    _links, patients = panel(svc, doctor_id)
    ids = list(patients)
    columns = "id, patient_id, probability, prediction, risk_tier, input, created_at"
    preds = predictions_of(svc, ids, columns) if ids else []
    scans = scans_of(svc, ids) if ids else []

    rows: dict[str, dict] = {}
    for pid, prof in patients.items():
        rows[pid] = {
            **prof,
            "age": age_from(prof.get("dob")),
            "record_counts": {"predictions": 0, "scans": 0},
            "latest_prediction": None,
            "status": "none",
            "last_activity_at": None,
            "pending_reviews": 0,
        }
    # both lists are newest first: the first row seen per patient is the latest
    for p in preds:
        row = rows.get(p["patient_id"])
        if row is None:
            continue
        row["record_counts"]["predictions"] += 1
        if p.get("status") == "pending":
            row["pending_reviews"] += 1
        if row["latest_prediction"] is None:
            row["latest_prediction"] = {
                k: p.get(k)
                for k in ("id", "probability", "prediction", "risk_tier", "status", "created_at")
            }
            row["status"] = clinical_status(p)
            row["last_activity_at"] = p.get("created_at")
            if row["age"] is None:  # no birth date: age entered in the prediction
                row["age"] = age_from(None, (p.get("input") or {}).get("age"))
    for s in scans:
        row = rows.get(s.get("patient_id"))
        if row is None:
            continue
        row["record_counts"]["scans"] += 1
        if (s.get("created_at") or "") > (row["last_activity_at"] or ""):
            row["last_activity_at"] = s.get("created_at")
    return sorted(rows.values(), key=lambda r: r.get("linked_at") or "", reverse=True)


@router.get("")
def list_panel(user: AuthUser = Depends(require_doctor)) -> dict:
    """Doctor's panel (Patients page): record counts, age, clinical status
    from the latest prediction, last activity, pending reviews."""
    return {"patients": _panel_rows(get_service_client(), user.id)}


def _fold(text: str) -> str:
    """Lowercase without accents: "Smaïl" → "smail", "Élodie" → "elodie"."""
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text or "")
        if not unicodedata.combining(ch)
    ).lower()


@router.get("/search")
def search_panel(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=8, ge=1, le=25),
    user: AuthUser = Depends(require_doctor),
) -> dict:
    """Top-bar patient search over the doctor's panel. Accent- and
    case-insensitive; matches every word of the query against the name,
    email, phone or patient ID (the 8-character code shown in the app)."""
    words = _fold(q).split()
    if not words:
        return {"results": []}
    digits = "".join(ch for ch in q if ch.isdigit())
    matches = []
    for row in _panel_rows(get_service_client(), user.id):
        haystack = " ".join(
            _fold(str(row.get(k) or "")) for k in ("full_name", "email", "id")
        )
        phone = "".join(ch for ch in str(row.get("phone") or "") if ch.isdigit())
        if all(w in haystack for w in words) or (len(digits) >= 4 and digits in phone):
            matches.append(row)
    # most recent activity first, then (stable sort) names that start with
    # the query ahead of the rest
    matches.sort(key=lambda r: r.get("last_activity_at") or "", reverse=True)
    matches.sort(key=lambda r: not _fold(r.get("full_name") or "").startswith(words[0]))
    keys = ("id", "full_name", "email", "age", "sex", "status", "last_activity_at")
    return {"results": [{k: row.get(k) for k in keys} for row in matches[:limit]]}


@router.put("/{patient_id}/next-visit")
def set_next_visit(
    patient_id: UUID, req: NextVisitRequest, user: AuthUser = Depends(require_doctor)
) -> dict:
    """Schedule (or clear) a panel patient's next clinic visit. The patient
    sees it on their home page and gets a visit_reminder notification."""
    pid = str(patient_id)
    if not has_panel_link(user.id, pid):
        raise HTTPException(
            status_code=403, detail="This patient is not in your panel."
        )
    when = req.next_visit_at.isoformat() if req.next_visit_at else None
    try:
        get_service_client().table("profiles").update({"next_visit_at": when}).eq(
            "id", pid
        ).execute()
    except Exception as exc:
        if "next_visit_at" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Apply backend/supabase/migrations/0010_next_visit.sql first.",
            ) from exc
        raise
    if when:
        notify(
            pid,
            "visit_reminder",
            {"at": when, "doctor": user.full_name or ""},
            link="/patient/notifications",
            actor_id=user.id,
        )
    audit_by(user, "patient.next_visit", "profile", pid, {"at": when})
    return {"patient_id": pid, "next_visit_at": when}


VITAL_FIELDS = (
    "systolic", "diastolic", "weight_kg", "height_cm",
    "fasting_glucose", "hba1c", "egfr", "acr",
)
MIGRATION_0011 = "Apply backend/supabase/migrations/0011_patient_record.sql first."


def _panel_patient(user: AuthUser, patient_id: UUID) -> str:
    pid = str(patient_id)
    if not has_panel_link(user.id, pid):
        raise HTTPException(status_code=403, detail="This patient is not in your panel.")
    return pid


def _needs_0011(exc: Exception) -> bool:
    text = str(exc)
    return any(
        k in text
        for k in ("patient_vitals", "consultation_notes", "cnas_number", "chifa_number", "blood_group")
    )


@router.get("/{patient_id}/clinical")
def patient_clinical(
    patient_id: UUID, user: AuthUser = Depends(require_doctor)
) -> dict:
    """Profile tabs: identifiers, vitals / lab history, consultation notes."""
    pid = _panel_patient(user, patient_id)
    audit_by(user, "record.view", "profile", pid)
    svc = get_service_client()
    profile = get_profile(pid)
    identifiers = {k: profile.get(k) for k in ("cnas_number", "chifa_number", "blood_group")}
    try:
        vitals = (
            svc.table("patient_vitals").select("*").eq("patient_id", pid)
            .order("measured_at", desc=True).limit(100).execute().data or []
        )
        notes = (
            svc.table("consultation_notes")
            .select("id, body, created_at, doctor:profiles!consultation_notes_doctor_id_fkey(full_name)")
            .eq("patient_id", pid)
            .order("created_at", desc=True).limit(100).execute().data or []
        )
        ready = True
    except Exception as exc:
        if not _needs_0011(exc):
            raise
        vitals, notes, ready = [], [], False
    return {"identifiers": identifiers, "vitals": vitals, "notes": notes, "migrated": ready}


@router.put("/{patient_id}/identifiers")
def set_identifiers(
    patient_id: UUID, req: IdentifiersRequest, user: AuthUser = Depends(require_doctor)
) -> dict:
    pid = _panel_patient(user, patient_id)
    values = {
        "cnas_number": (req.cnas_number or "").strip() or None,
        "chifa_number": (req.chifa_number or "").strip() or None,
        "blood_group": req.blood_group,
    }
    try:
        get_service_client().table("profiles").update(values).eq("id", pid).execute()
    except Exception as exc:
        if _needs_0011(exc):
            raise HTTPException(status_code=400, detail=MIGRATION_0011) from exc
        raise
    audit_by(user, "patient.identifiers", "profile", pid, {"fields": sorted(k for k, v in values.items() if v)})
    return values


@router.post("/{patient_id}/vitals", status_code=201)
def add_vitals(
    patient_id: UUID, req: VitalsRequest, user: AuthUser = Depends(require_doctor)
) -> dict:
    pid = _panel_patient(user, patient_id)
    row = {k: getattr(req, k) for k in VITAL_FIELDS if getattr(req, k) is not None}
    if not row:
        raise HTTPException(status_code=422, detail="Enter at least one measurement.")
    row.update(patient_id=pid, recorded_by=user.id)
    if req.measured_at:
        row["measured_at"] = req.measured_at.isoformat()
    try:
        res = get_service_client().table("patient_vitals").insert(row).execute()
    except Exception as exc:
        if _needs_0011(exc):
            raise HTTPException(status_code=400, detail=MIGRATION_0011) from exc
        raise
    audit_by(user, "vitals.create", "profile", pid, {"fields": sorted(k for k in row if k in VITAL_FIELDS)})
    return (res.data or [row])[0]


@router.post("/{patient_id}/notes", status_code=201)
def add_note(
    patient_id: UUID, req: NoteRequest, user: AuthUser = Depends(require_doctor)
) -> dict:
    pid = _panel_patient(user, patient_id)
    body = req.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="The note is empty.")
    try:
        res = (
            get_service_client().table("consultation_notes")
            .insert({"patient_id": pid, "doctor_id": user.id, "body": body})
            .execute()
        )
    except Exception as exc:
        if _needs_0011(exc):
            raise HTTPException(status_code=400, detail=MIGRATION_0011) from exc
        raise
    note = (res.data or [{}])[0]
    note["doctor"] = {"full_name": user.full_name}
    audit_by(user, "note.create", "profile", pid, {"note_id": note.get("id")})
    return note


@router.get("/{patient_id}/records")
def patient_records(
    patient_id: UUID, user: AuthUser = Depends(require_doctor)
) -> dict:
    """Full clinical history (predictions + scans) of a panel patient."""
    pid = str(patient_id)
    if not has_panel_link(user.id, pid):
        raise HTTPException(
            status_code=403, detail="This patient is not in your panel."
        )
    profile = get_profile(pid)

    svc = get_service_client()
    preds = (
        svc.table("predictions")
        .select(
            "*, doctor:profiles!predictions_doctor_id_fkey(full_name)"
        )
        .eq("patient_id", pid)
        .order("created_at", desc=True)
        .execute()
    )
    scans = (
        svc.table("scans")
        .select("*, operator:profiles!scans_user_id_fkey(full_name)")
        .eq("patient_id", pid)
        .order("created_at", desc=True)
        .execute()
    )

    predictions = []
    for p in preds.data or []:
        p = dict(p)
        if p.get("waterfall_path"):
            p["waterfall_url"] = signed_url(BUCKET, p["waterfall_path"])
        predictions.append(p)

    scan_items = []
    for s in scans.data or []:
        s = dict(s)
        if s.get("storage_path"):
            s["image_url"] = signed_url(BUCKET, s["storage_path"])
        scan_items.append(s)

    return {"patient": profile, "predictions": predictions, "scans": scan_items}
