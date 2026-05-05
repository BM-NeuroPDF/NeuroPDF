from fastapi.testclient import TestClient

from app.config import settings
from app.main import app, _validate_cors_policy


def test_preflight_allows_configured_origin():
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization,Content-Type",
            },
        )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_production_rejects_wildcard_origin(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setattr(settings, "CORS_ALLOWED_ORIGINS_RAW", "*")

    try:
        _validate_cors_policy()
        assert False, "Expected RuntimeError for wildcard CORS origin in production"
    except RuntimeError as exc:
        assert "CORS_ALLOWED_ORIGINS" in str(exc)


def test_cors_production_allows_explicit_origin(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setattr(settings, "CORS_ALLOWED_ORIGINS_RAW", "https://app.example.com")
    monkeypatch.setattr(settings, "CORS_ALLOWED_METHODS_RAW", "GET,POST,OPTIONS")
    monkeypatch.setattr(
        settings,
        "CORS_ALLOWED_HEADERS_RAW",
        "Authorization,Content-Type,X-Request-Id",
    )

    _validate_cors_policy()
