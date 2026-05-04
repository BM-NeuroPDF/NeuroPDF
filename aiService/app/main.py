from fastapi import FastAPI
from .routers import analysis  # senin /api/v1/ai routerın

app = FastAPI(title="AI Service")

app.include_router(analysis.router)


@app.get("/health")
def health_root():
    """Liveness for Docker / probes (no API key)."""
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
