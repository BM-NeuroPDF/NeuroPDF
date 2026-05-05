"""Structured, metric-friendly cache observability logs (stdout-friendly key=value lines)."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Mapping

logger = logging.getLogger(__name__)

_REDACT_PREFIX = "h:"


def redact_cache_key(key: str | None) -> str:
    """Return a short, stable fingerprint of a cache key (no raw user ids or secrets)."""
    if key is None:
        return "none"
    raw = str(key).encode("utf-8", errors="replace")
    digest = hashlib.sha256(raw).hexdigest()[:12]
    return f"{_REDACT_PREFIX}{digest}"


def _fmt_pair(k: str, v: Any) -> str:
    if isinstance(v, bool):
        val = "true" if v else "false"
    elif v is None:
        val = "none"
    elif isinstance(v, float):
        val = f"{v:.6g}"
    elif isinstance(v, int):
        val = str(v)
    else:
        val = str(v)
    if any(ch in val for ch in ' ="'):
        val = json.dumps(val, ensure_ascii=True)
    return f"{k}={val}"


def _append_extra(parts: list[str], extra: Mapping[str, Any] | None) -> None:
    if not extra:
        return
    for ek in sorted(extra.keys()):
        parts.append(_fmt_pair(f"extra_{ek}", extra[ek]))


def log_cache(
    name: str,
    key: str | None,
    hit: bool,
    *,
    ttl: int | None = None,
    latency_ms: float | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Emit one line: event=cache_lookup name=... key=h:... hit=... phase=cache_hit|cache_miss ...
    """
    phase = "cache_hit" if hit else "cache_miss"
    parts = [
        "event=cache_lookup",
        _fmt_pair("name", name),
        _fmt_pair("key", redact_cache_key(key)),
        _fmt_pair("hit", hit),
        f"phase={phase}",
    ]
    if ttl is not None:
        parts.append(_fmt_pair("ttl", ttl))
    if latency_ms is not None:
        parts.append(_fmt_pair("latency_ms", latency_ms))
    _append_extra(parts, extra)
    logger.info("%s", " ".join(parts))
    try:
        from .metrics import observe_cache_lookup

        observe_cache_lookup(name=name, hit=hit)
    except Exception:
        # Metrics must never impact business flow/logging.
        pass


def log_cache_invalidate(
    name: str,
    *keys: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Log explicit cache key invalidation (Redis delete, etc.)."""
    if not keys:
        return
    redacted = ",".join(redact_cache_key(k) for k in keys)
    parts = [
        "event=cache_invalidate",
        _fmt_pair("name", name),
        _fmt_pair("key_count", len(keys)),
        _fmt_pair("keys", redacted),
    ]
    _append_extra(parts, extra)
    logger.info("%s", " ".join(parts))


def log_cache_backend_error(
    name: str,
    key: str | None,
    *,
    error: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Non-lookup cache backend failures (Redis errors, etc.)."""
    parts = [
        "event=cache_backend_error",
        _fmt_pair("name", name),
        _fmt_pair("key", redact_cache_key(key)),
        _fmt_pair("error", error),
    ]
    _append_extra(parts, extra)
    logger.warning("%s", " ".join(parts))
