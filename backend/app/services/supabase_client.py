"""Supabase clients.

- anon client: verifies user JWTs from the frontend (auth.get_user)
- service client: DB / Storage / Admin operations (bypasses RLS — backend only)
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


class SupabaseNotConfigured(RuntimeError):
    def __init__(self, what: str):
        super().__init__(
            f"Supabase is not configured ({what}). "
            "Fill SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY "
            "in backend/.env — see backend/.env.example."
        )


def _check(keys: dict[str, str]) -> None:
    missing = [name for name, value in keys.items() if not value]
    if missing:
        raise SupabaseNotConfigured(", ".join(missing))


@lru_cache
def get_anon_client() -> Client:
    s = get_settings()
    _check({"SUPABASE_URL": s.supabase_url, "SUPABASE_ANON_KEY": s.supabase_anon_key})
    return create_client(s.supabase_url, s.supabase_anon_key)


@lru_cache
def get_service_client() -> Client:
    s = get_settings()
    _check(
        {
            "SUPABASE_URL": s.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": s.supabase_service_role_key,
        }
    )
    return create_client(s.supabase_url, s.supabase_service_role_key)


def signed_url(bucket: str, path: str) -> str:
    """Signed URL for a private object, robust across supabase-py versions."""
    s = get_settings()
    res = get_service_client().storage.from_(bucket).create_signed_url(
        path, s.signed_url_ttl
    )
    url = None
    if isinstance(res, dict):
        url = res.get("signedURL") or res.get("signed_url") or res.get("signedUrl")
    else:
        url = getattr(res, "signed_url", None) or getattr(res, "signedURL", None)
    if not url:
        return ""
    if url.startswith("http"):
        return url
    return f"{s.supabase_url}/storage/v1{url}"
