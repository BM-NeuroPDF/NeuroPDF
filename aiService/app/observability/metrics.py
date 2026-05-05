"""Prometheus metrics registry and helpers for aiService API."""

from __future__ import annotations

from fastapi import Request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency seconds",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)

CACHE_LOOKUPS_TOTAL = Counter(
    "cache_lookups_total",
    "Total cache lookups by name and result",
    ["name", "result"],
)

RATE_LIMIT_DECISIONS_TOTAL = Counter(
    "rate_limit_decisions_total",
    "Total rate limit decisions by category and result",
    ["category", "result"],
)

REDIS_UP = Gauge("redis_up", "Redis connectivity health (1=up, 0=down)")


def _route_path(request: Request) -> str:
    route = request.scope.get("route")
    if route is not None:
        path = getattr(route, "path", None)
        if path:
            return str(path)
    return request.url.path


def observe_http_request(request: Request, status_code: int, duration_seconds: float) -> None:
    path = _route_path(request)
    method = request.method.upper()
    status = str(status_code)
    HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=status).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(method=method, path=path).observe(duration_seconds)


def set_redis_up(is_up: bool) -> None:
    REDIS_UP.set(1 if is_up else 0)


def metrics_payload() -> bytes:
    return generate_latest()


METRICS_CONTENT_TYPE = CONTENT_TYPE_LATEST
