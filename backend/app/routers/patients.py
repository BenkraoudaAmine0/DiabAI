"""Doctor's patient panel: create patient accounts, link existing ones,
list the panel, and read a patient's full diagnostic history."""

import secrets
import string
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, require_doctor
from app.schemas import (
    CreatePatientRequest,
    CreatePatientResponse,
    LinkPatientRequest,
    PatientCredentialsRequest,
)
from app.services.notification_service import notify
from app.services.panel import get_profile, has_panel_link
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
    return {"linked": True, "patient": profile}


@router.get("")
def list_panel(user: AuthUser = Depends(require_doctor)) -> dict:
    """Doctor's panel with per-patient record counts."""
    svc = get_service_client()
    links = (
        svc.table("doctor_patients")
        .select(
            "patient_id, created_at, "
            "profiles!doctor_patients_patient_id_fkey("
            "id, email, full_name, dob, sex, phone, created_at)"
        )
        .eq("doctor_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )

    items = [dict(l["profiles"], linked_at=l["created_at"]) for l in links.data]
    ids = [p["id"] for p in items]

    counts: dict[str, dict] = {i: {"predictions": 0, "scans": 0} for i in ids}
    if ids:
        preds = (
            svc.table("predictions").select("patient_id").in_("patient_id", ids)
            .execute()
        )
        scans = (
            svc.table("scans").select("patient_id").in_("patient_id", ids)
            .execute()
        )
        for r in preds.data or []:
            counts[r["patient_id"]]["predictions"] += 1
        for r in scans.data or []:
            if r.get("patient_id"):
                counts[r["patient_id"]]["scans"] += 1

    for p in items:
        p["record_counts"] = counts.get(p["id"], {"predictions": 0, "scans": 0})

    return {"patients": items}


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
