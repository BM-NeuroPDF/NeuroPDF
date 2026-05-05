from __future__ import annotations

import hashlib
import hmac
import json
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import get_db, get_supabase
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _bypass_callback_ip_rate_limit():
    """Callback tests assert signature/CIDR behavior, not Redis-backed ip_rpm."""
    with patch("app.routers.files.routes_summarize.check_rate_limit", return_value=True):
        yield


class FakeRedis:
    def __init__(self) -> None:
        self.keys: dict[str, str] = {}

    def set(self, key: str, value: str, nx: bool = False, ex: int | None = None):
        if nx and key in self.keys:
            return False
        self.keys[key] = value
        return True


def _sign_headers(
    secret: str,
    *,
    method: str,
    path: str,
    body: bytes,
    timestamp: int | None = None,
) -> dict[str, str]:
    ts = str(timestamp if timestamp is not None else int(time.time()))
    body_sha256 = hashlib.sha256(body).hexdigest()
    canonical = f"{method.upper()}|{path}|{ts}|{body_sha256}"
    sig = hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Callback-Timestamp": ts,
        "X-Callback-Signature": sig,
    }


def _callback_body(pdf_id: int = 1) -> bytes:
    payload = {"pdf_id": pdf_id, "status": "completed", "summary": "ok"}
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def test_callback_valid_signature_returns_200():
    fake_redis = FakeRedis()
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    headers = _sign_headers(
        "cb-secret",
        method="POST",
        path="/files/callback/1",
        body=body,
    )
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", fake_redis),
    ):
        response = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert response.status_code == 200


def test_callback_negative_timestamp_rejected():
    fake_redis = FakeRedis()
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    headers = _sign_headers(
        "cb-secret",
        method="POST",
        path="/files/callback/1",
        body=body,
        timestamp=-1,
    )
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", fake_redis),
    ):
        response = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_callback_expired_timestamp_rejected():
    fake_redis = FakeRedis()
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    expired_ts = int(time.time()) - 9999
    headers = _sign_headers(
        "cb-secret",
        method="POST",
        path="/files/callback/1",
        body=body,
        timestamp=expired_ts,
    )
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", fake_redis),
    ):
        response = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_callback_bad_signature_rejected():
    fake_redis = FakeRedis()
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    headers = {
        "Content-Type": "application/json",
        "X-Callback-Timestamp": str(int(time.time())),
        "X-Callback-Signature": "deadbeef",
    }
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", fake_redis),
    ):
        response = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_callback_replay_rejected():
    fake_redis = FakeRedis()
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    headers = _sign_headers(
        "cb-secret",
        method="POST",
        path="/files/callback/1",
        body=body,
    )
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", fake_redis),
    ):
        first = client.post("/files/callback/1", content=body, headers=headers)
        second = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert first.status_code == 200
    assert second.status_code == 403


def test_callback_cidr_not_allowed_rejected():
    fake_redis = FakeRedis()
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    headers = _sign_headers(
        "cb-secret",
        method="POST",
        path="/files/callback/1",
        body=body,
    )
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch(
            "app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW",
            "10.0.0.0/8",
        ),
        patch("app.callback_security.redis_client", fake_redis),
    ):
        response = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert response.status_code == 403


def test_callback_redis_down_fail_closed_503():
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: MagicMock()
    body = _callback_body(1)
    headers = _sign_headers(
        "cb-secret",
        method="POST",
        path="/files/callback/1",
        body=body,
    )
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_TIMESTAMP_SKEW_SEC", 300),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", None),
    ):
        response = client.post("/files/callback/1", content=body, headers=headers)
    app.dependency_overrides.clear()
    assert response.status_code == 503


def test_production_requires_callback_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("CALLBACK_SECRET", raising=False)
    monkeypatch.delenv("INTERNAL_CALLBACK_SECRET", raising=False)
    monkeypatch.setenv("JWT_SECRET", "x")
    monkeypatch.setenv("SUPABASE_URL", "http://s")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("DB_USER", "u")
    monkeypatch.setenv("DB_PASSWORD", "p")
    monkeypatch.setenv("DB_HOST", "h")

    with pytest.raises(RuntimeError, match="CALLBACK_SECRET"):
        Settings()
