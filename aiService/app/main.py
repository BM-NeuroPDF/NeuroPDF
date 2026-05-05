import os
import time

import redis
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from .config import settings
from .observability.metrics import (
    METRICS_CONTENT_TYPE,
    metrics_payload,
    observe_http_request,
    set_redis_up,
)
from .observability.sentry import init_sentry
from .routers import analysis  # senin /api/v1/ai routerın

app = FastAPI(title="AI Service")
init_sentry(settings, "ai-service")

app.include_router(analysis.router)


@app.middleware("http")
async def observe_http_metrics(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    observe_http_request(request, response.status_code, duration)
    return response


@app.get("/health")
def health_root():
    """Liveness for Docker / probes (no API key)."""
    try:
        redis.Redis.from_url(settings.REDIS_URL).ping()
        set_redis_up(True)
    except Exception:
        set_redis_up(False)
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "aiService",
        "docs": "/docs",
        "health": "/health",
        "health_detailed": "/api/v1/ai/health",
    }


@app.get("/_debug/sentry")
def debug_sentry():
    if os.getenv("DEBUG", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    raise RuntimeError("Sentry debug endpoint exception")


@app.get("/metrics")
def metrics(request: Request):
    client_host = request.client.host if request.client else ""
    is_local = client_host in {"127.0.0.1", "::1", "localhost"}
    token = request.headers.get("X-Metrics-Token", "")
    if settings.METRICS_TOKEN:
        if token != settings.METRICS_TOKEN:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    elif not (settings.METRICS_ALLOW_INSECURE_LOCAL and is_local):
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return Response(content=metrics_payload(), media_type=METRICS_CONTENT_TYPE)
