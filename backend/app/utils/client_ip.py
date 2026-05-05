"""Client IP behind reverse proxies (X-Forwarded-For / X-Real-IP)."""

from __future__ import annotations

from fastapi import Request

from ..config import settings


def get_client_ip(request: Request) -> str:
    """
    Prefer the real client IP when TRUSTED_PROXY_HOPS > 0 and trusted headers exist.

    Set TRUSTED_PROXY_HOPS=1 (or higher) only when the app is reached exclusively
    through reverse proxies that set X-Forwarded-For / X-Real-IP correctly.
    Run Uvicorn with --proxy-headers (and restrict --forwarded-allow-ips in prod).
    """
    hops = int(getattr(settings, "TRUSTED_PROXY_HOPS", 0) or 0)
    if hops > 0:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                return parts[0]
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"
