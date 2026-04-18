# backend/app/main.py
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from sqlalchemy.exc import OperationalError, PendingRollbackError
from app.config import settings
from app.routers import auth, guest, files, user_avatar_routes

# Security scheme for Swagger UI
security_scheme = HTTPBearer(bearerFormat="JWT", scheme_name="Bearer")

app = FastAPI(
    title=settings.API_NAME,
    description="PDF Project API with Supabase",
    version="1.0.0",
    swagger_ui_init_oauth={"clientId": "api-client", "appName": "NeuroPDF API"},
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
# Development için localhost'u da ekle
cors_origins = [
    settings.FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "https://localhost:3000",
    "https://localhost:3001",
    "https://localhost:3002",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    import logging

    logger = logging.getLogger(__name__)

    try:
        response = await call_next(request)
    except (OperationalError, PendingRollbackError):
        raise
    except Exception as e:
        # Log the exception for debugging
        logger.error(f"Unhandled exception in {request.url.path}: {e}", exc_info=True)
        # Always show error details in development
        is_dev = (
            os.getenv("ENVIRONMENT", "").lower() in ["development", "dev"]
            or os.getenv("DEBUG", "").lower() == "true"
        )
        response = JSONResponse(
            status_code=500,
            content={"detail": str(e) if is_dev else "Internal server error"},
        )

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
    """Detailed health check"""
    from sqlalchemy import text

    from app.config import settings
    from app.db import engine, get_supabase

    if not settings.USE_SUPABASE:
        try:
            if engine is None:
                return {"api": "ok", "database": "error: engine not initialized"}
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"api": "ok", "database": "local_postgres_connected"}
        except Exception as e:
            return {"api": "ok", "database": f"error: {str(e)}"}

    try:
        supabase_client = get_supabase()
        supabase_client.table("users").select("id").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {"api": "ok", "database": db_status}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
