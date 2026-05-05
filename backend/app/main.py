# backend/app/main.py
from contextlib import asynccontextmanager
import logging
import os
import time

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from sqlalchemy.exc import OperationalError, PendingRollbackError
from app.config import settings
from app.observability.metrics import (
    METRICS_CONTENT_TYPE,
    metrics_payload,
    observe_http_request,
    set_redis_up,
)
from app.observability.sentry import init_sentry
from app.routers import auth, guest, files, user_avatar_routes

logger = logging.getLogger(__name__)
init_sentry(settings, "backend")

# Security scheme for Swagger UI
security_scheme = HTTPBearer(bearerFormat="JWT", scheme_name="Bearer")


def _validate_cors_policy() -> None:
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env in {"prod", "production"}:
        if "*" in settings.CORS_ALLOWED_ORIGINS:
            logger.error("CORS misconfiguration: wildcard origin is not allowed in production.")
            raise RuntimeError("CORS_ALLOWED_ORIGINS cannot contain '*' in production.")
        if "*" in settings.CORS_ALLOWED_METHODS:
            logger.error("CORS misconfiguration: wildcard methods are not allowed in production.")
            raise RuntimeError("CORS_ALLOWED_METHODS cannot contain '*' in production.")
        if "*" in settings.CORS_ALLOWED_HEADERS:
            logger.error("CORS misconfiguration: wildcard headers are not allowed in production.")
            raise RuntimeError("CORS_ALLOWED_HEADERS cannot contain '*' in production.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = httpx.AsyncClient(timeout=60, follow_redirects=True)
    app.state.ai_http_client = client
    try:
        yield
    finally:
        await client.aclose()


app = FastAPI(
    title=settings.API_NAME,
    description="PDF Project API with Supabase",
    version="1.0.0",
    swagger_ui_init_oauth={"clientId": "api-client", "appName": "NeuroPDF API"},
    lifespan=lifespan,
)


@app.exception_handler(OperationalError)
async def operational_error_handler(request: Request, exc: OperationalError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database connection temporarily unavailable. Please try again."
        },
    )


@app.exception_handler(PendingRollbackError)
async def pending_rollback_error_handler(request: Request, exc: PendingRollbackError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database connection temporarily unavailable. Please try again."
        },
    )


# Add security scheme to OpenAPI schema
app.openapi_schema = None


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "Bearer": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter JWT token (Bearer token from login/register endpoint)",
        }
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

# Export security scheme for use in routers (optional)
bearer_scheme = security_scheme

# CORS Middleware
_validate_cors_policy()
cors_origins = settings.CORS_ALLOWED_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOWED_METHODS,
    allow_headers=settings.CORS_ALLOWED_HEADERS,
    expose_headers=["*"],
)


# Security Headers Middleware (exceptions propagate to FastAPI handlers)
@app.middleware("http")
async def add_security_headers(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    # CORS header'ları her zaman ekle (hata durumunda bile)
    origin = request.headers.get("origin")
    if origin and origin in cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        "img-src 'self' data: https:; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self';"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    observe_http_request(request, response.status_code, duration)
    return response


app.include_router(auth.router)
app.include_router(guest.router)
app.include_router(files.router)
app.include_router(user_avatar_routes.router)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "message": "PDF Project API is running", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    """Liveness: no auth, no DB (Docker / load balancers)."""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """Readiness: database connectivity (optional ops probe)."""
    from sqlalchemy import text

    from app.config import settings
    from app.db import engine, get_supabase

    try:
        from app.redis_client import redis_client

        if redis_client is None:
            redis_status = "unavailable"
            set_redis_up(False)
        else:
            redis_client.ping()
            redis_status = "connected"
            set_redis_up(True)
    except Exception as e:
        redis_status = f"error: {str(e)}"
        set_redis_up(False)

    if not settings.USE_SUPABASE:
        try:
            if engine is None:
                return {
                    "api": "ok",
                    "database": "error: engine not initialized",
                    "redis": redis_status,
                }
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {
                "api": "ok",
                "database": "local_postgres_connected",
                "redis": redis_status,
            }
        except Exception as e:
            return {"api": "ok", "database": f"error: {str(e)}", "redis": redis_status}

    try:
        supabase_client = get_supabase()
        supabase_client.table("users").select("id").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {"api": "ok", "database": db_status, "redis": redis_status}


@app.get("/_debug/sentry")
async def debug_sentry():
    if os.getenv("DEBUG", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    raise RuntimeError("Sentry debug endpoint exception")


@app.get("/metrics")
async def metrics(request: Request):
    client_host = request.client.host if request.client else ""
    is_local = client_host in {"127.0.0.1", "::1", "localhost"}
    token = request.headers.get("X-Metrics-Token", "")
    if settings.METRICS_TOKEN:
        if token != settings.METRICS_TOKEN:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    elif not (settings.METRICS_ALLOW_INSECURE_LOCAL and is_local):
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return Response(content=metrics_payload(), media_type=METRICS_CONTENT_TYPE)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
