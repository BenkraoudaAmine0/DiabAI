"""In-process request metrics for the admin "System health" page: requests
per minute and latency over the last 60 minutes, kept in memory (they reset
when the API restarts — nothing is stored)."""

import threading
import time
from collections import deque
from typing import Optional

STARTED_AT = time.time()
WINDOW_MINUTES = 60
# endpoints that run a model (diabetes predictor, vision models)
ML_PREFIXES = ("/api/diabetes/predict", "/api/scan/")

_lock = threading.Lock()
# minute (epoch // 60) → {"api": [latencies ms], "ml": [...], "errors": n}
_buckets: dict[int, dict] = {}
_order: deque[int] = deque()


def _group(path: str) -> Optional[str]:
    if not path.startswith("/api/") or path == "/api/health":
        return None
    return "ml" if path.startswith(ML_PREFIXES) else "api"


def record(path: str, status: int, millis: float) -> None:
    group = _group(path)
    if group is None:
        return
    minute = int(time.time() // 60)
    with _lock:
        bucket = _buckets.get(minute)
        if bucket is None:
            bucket = _buckets[minute] = {"api": [], "ml": [], "errors": 0}
            _order.append(minute)
            while _order and _order[0] < minute - WINDOW_MINUTES:
                _buckets.pop(_order.popleft(), None)
        bucket[group].append(millis)
        if status >= 500:
            bucket["errors"] += 1


def _p95(values: list[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(0.95 * len(ordered)))], 1)


def snapshot() -> dict:
    now_minute = int(time.time() // 60)
    with _lock:
        minutes = []
        api_all: list[float] = []
        ml_all: list[float] = []
        errors = 0
        for m in range(now_minute - WINDOW_MINUTES + 1, now_minute + 1):
            b = _buckets.get(m, {"api": [], "ml": [], "errors": 0})
            api_all += b["api"]
            ml_all += b["ml"]
            errors += b["errors"]
            minutes.append(
                {
                    "minute": m * 60,
                    "requests": len(b["api"]) + len(b["ml"]),
                    "ml_requests": len(b["ml"]),
                    "p95_ms": _p95(b["api"] + b["ml"]),
                }
            )
    total = len(api_all) + len(ml_all)
    return {
        "started_at": STARTED_AT,
        "uptime_seconds": int(time.time() - STARTED_AT),
        "window_minutes": WINDOW_MINUTES,
        "requests": total,
        "requests_per_minute": round(total / WINDOW_MINUTES, 1),
        "server_errors": errors,
        "api_p95_ms": _p95(api_all),
        "ml_p95_ms": _p95(ml_all),
        "ml_requests": len(ml_all),
        "minutes": minutes,
    }
