from __future__ import annotations

import os
from typing import Any

SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "set-cookie",
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "jwt",
    "secret",
    "api_key",
    "email",
}

MASK = "[Filtered]"
_SERVICE_TAG = "backend"
_ENV_TAG = "development"
_RELEASE_TAG = "backend@dev"


def _endpoint_category_from_url(url: str) -> str:
    if url.startswith("/auth") or url.startswith("/files/callback") or url.startswith(
        "/billing"
    ):
        return "critical"
    if url.startswith("/files/global-stats") or url.startswith("/guest/global"):
        return "low"
    return "default"


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    if lowered in SENSITIVE_KEYS:
        return True
    return any(marker in lowered for marker in ("password", "token", "secret", "cookie"))


def sanitize_pii(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, inner in value.items():
            if _is_sensitive_key(str(key)):
                sanitized[str(key)] = MASK
            else:
                sanitized[str(key)] = sanitize_pii(inner)
        return sanitized
    if isinstance(value, list):
        return [sanitize_pii(item) for item in value]
    return value


def scrub_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = sanitize_pii(headers)
        data = request.get("data")
        if isinstance(data, (dict, list)):
            request["data"] = sanitize_pii(data)
        url = request.get("url")
        if isinstance(url, str):
            tags = event.setdefault("tags", {})
            if isinstance(tags, dict):
                tags.setdefault("endpoint_category", _endpoint_category_from_url(url))

    user = event.get("user")
    if isinstance(user, dict):
        for pii_key in ("email", "ip_address", "username"):
            if pii_key in user:
                user[pii_key] = MASK

    tags = event.setdefault("tags", {})
    if isinstance(tags, dict):
        tags.setdefault("service", _SERVICE_TAG)
        tags.setdefault("env", _ENV_TAG)
        tags.setdefault("release", _RELEASE_TAG)

    return event


def init_sentry(settings: Any, service_name: str) -> None:
    global _SERVICE_TAG, _ENV_TAG, _RELEASE_TAG
    dsn = (getattr(settings, "SENTRY_DSN", "") or "").strip()
    if not dsn:
        return
    _SERVICE_TAG = service_name
    _ENV_TAG = getattr(settings, "SENTRY_ENV", "development")
    _RELEASE_TAG = f"{service_name}@{getattr(settings, 'GIT_SHA', 'dev')}"
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
    except Exception:
        return

    traces_sample_rate_raw = getattr(settings, "SENTRY_TRACES_SAMPLE_RATE", None)
    if traces_sample_rate_raw in (None, ""):
        env = (getattr(settings, "SENTRY_ENV", "") or os.getenv("ENVIRONMENT", "development")).lower()
        traces_sample_rate = 0.1 if env in {"prod", "production"} else 0.0
    else:
        traces_sample_rate = float(traces_sample_rate_raw)

    sentry_sdk.init(
        dsn=dsn,
        environment=_ENV_TAG,
        release=_RELEASE_TAG,
        traces_sample_rate=traces_sample_rate,
        send_default_pii=False,
        integrations=[FastApiIntegration()],
        before_send=scrub_event,
        initial_scope={
            "tags": {
                "service": _SERVICE_TAG,
                "env": _ENV_TAG,
                "release": _RELEASE_TAG,
            }
        },
    )
