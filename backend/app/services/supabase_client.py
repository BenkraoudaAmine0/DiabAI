"""Supabase clients.

- anon client: verifies user JWTs from the frontend (auth.get_user)
- service client: DB / Storage / Admin operations (bypasses RLS — backend only)
"""

import logging
from functools import lru_cache

import httpx
from supabase import Client, create_client

from app.config import get_settings

log = logging.getLogger(__name__)


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


# ── connection hardening ────────────────────────────────────────────────────
# A single long-lived HTTP/2 connection shared by all request threads dies
# for everyone at once when Supabase closes it ("Server disconnected",
# "ConnectionTerminated"). HTTP/1.1 with short keep-alive gives each thread
# its own connection and drops idle ones before the server does.

def _harden(client: Client) -> Client:
    try:
        old = client.postgrest.session
        client.postgrest.session = httpx.Client(
            base_url=old.base_url,
            headers=old.headers,
            http2=False,
            follow_redirects=True,
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
                keepalive_expiry=20,
            ),
        )
    except Exception as exc:  # never block startup on this
        log.warning("Could not harden Supabase HTTP client: %s", exc)
    return client


@lru_cache
def get_anon_client() -> Client:
    s = get_settings()
    _check({"SUPABASE_URL": s.supabase_url, "SUPABASE_ANON_KEY": s.supabase_anon_key})
    return _harden(create_client(s.supabase_url, s.supabase_anon_key))


@lru_cache
def get_service_client() -> Client:
    s = get_settings()
    _check(
        {
            "SUPABASE_URL": s.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": s.supabase_service_role_key,
        }
    )
    return _harden(create_client(s.supabase_url, s.supabase_service_role_key))


# ── retry for dropped connections (READ queries only) ───────────────────────
_RETRY_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.WriteError,
    httpx.PoolTimeout,
)


def execute(query, retries: int = 2):
    """Run a read query, retrying if the connection was dropped.

    query: zero-argument function that builds AND executes the query, e.g.
        execute(lambda: sb.table("patients").select("*").execute())
    """
    for attempt in range(retries + 1):
        try:
            return query()
        except _RETRY_ERRORS as exc:
            if attempt == retries:
                raise
            log.warning(
                "Supabase query dropped (%s: %s), retrying (attempt %d/%d)...",
                type(exc).__name__,
                exc,
                attempt + 1,
                retries,
            )



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