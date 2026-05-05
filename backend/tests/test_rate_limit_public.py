from __future__ import annotations

from collections import OrderedDict
import hashlib
import hmac
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.db import get_supabase, get_db
from app.deps import get_current_user, get_current_user_optional
from app.rate_limit import RateLimitRule
from app.repositories.dto import GlobalStatsDTO

client = TestClient(app)


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    def get(self, key: str):
        value = self.store.get(key)
        return str(value) if value is not None else None

    def setex(self, key: str, window: int, value: int) -> None:
        self.store[key] = int(value)
        self.ttls[key] = int(window)

    def incr(self, key: str) -> int:
        self.store[key] = int(self.store.get(key, 0)) + 1
        return self.store[key]

    def ttl(self, key: str) -> int:
        return int(self.ttls.get(key, 1))

    def set(self, key: str, value: str, nx: bool = False, ex: int | None = None):
        if nx and key in self.store:
            return False
        self.store[key] = 1
        if ex is not None:
            self.ttls[key] = ex
        return True


def _signed_callback_headers(payload: dict, secret: str, ts: int | None = None) -> dict:
    ts = str(ts if ts is not None else int(time.time()))
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    body_sha = hashlib.sha256(body).hexdigest()
    path = f"/files/callback/{payload['pdf_id']}"
    canonical = f"POST|{path}|{ts}|{body_sha}"
    sig = hmac.new(
        secret.encode("utf-8"),
        msg=canonical.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Callback-Secret": secret,
        "X-Callback-Timestamp": ts,
        "X-Callback-Signature": sig,
    }


def test_guest_check_usage_returns_429_with_retry_after():
    fake_redis = FakeRedis()
    strict_limits = {"check_usage": [RateLimitRule("ip_rpm", limit=1, window_seconds=60)]}
    with (
        patch("app.rate_limit.redis_client", fake_redis),
        patch.dict("app.routers.guest.PUBLIC_GUEST_LIMITS", strict_limits, clear=False),
        patch("app.routers.guest.get_guest_usage_count", return_value=0),
    ):
        first = client.get("/guest/check-usage", headers={"X-Guest-ID": "g-1"})
        second = client.get("/guest/check-usage", headers={"X-Guest-ID": "g-1"})
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers.get("Retry-After") == "60"


def test_global_stats_returns_429_with_retry_after():
    fake_redis = FakeRedis()
    mock_supabase = MagicMock()
    mock_db = MagicMock()
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_db] = lambda: mock_db
    with (
        patch("app.rate_limit.redis_client", fake_redis),
        patch.dict(
            "app.routers.files.PUBLIC_LIMITS",
            {"global_stats": [RateLimitRule("ip_rpm", limit=1, window_seconds=60)]},
            clear=False,
        ),
        patch("app.routers.files.stats_cache_get_json", return_value=None),
        patch(
            "app.routers.files.stats_repo.get_global_stats",
            new=AsyncMock(
                return_value=GlobalStatsDTO(
                    total_users=1, total_processed=1, total_ai_summaries=1
                )
            ),
        ),
    ):
        first = client.get("/files/global-stats")
        second = client.get("/files/global-stats")
    app.dependency_overrides.clear()
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers.get("Retry-After") == "60"


def test_summarize_guest_returns_429_with_retry_after():
    fake_redis = FakeRedis()
    with (
        patch("app.rate_limit.redis_client", fake_redis),
        patch.dict(
            "app.routers.files.PUBLIC_LIMITS",
            {"summarize_guest": [RateLimitRule("ip_rpm", limit=1, window_seconds=60)]},
            clear=False,
        ),
    ):
        files = {"file": ("x.pdf", b"%PDF-1.4 test", "application/pdf")}
        first = client.post("/files/summarize-guest", files=files)
        second = client.post("/files/summarize-guest", files=files)
    assert first.status_code != 429
    assert second.status_code == 429
    assert second.headers.get("Retry-After") == "60"


def test_markdown_to_pdf_payload_guard():
    payload = {"markdown": "x" * 120_000}
    response = client.post("/files/markdown-to-pdf", json=payload)
    assert response.status_code == 413


def test_callback_rate_limited_returns_retry_after():
    fake_redis = FakeRedis()
    mock_supabase = MagicMock()
    mock_db = MagicMock()
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1"}
    app.dependency_overrides[get_current_user_optional] = lambda: {"sub": "user-1"}
    payload = {"pdf_id": 1, "status": "completed", "summary": "ok", "user_id": "u1"}
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.rate_limit.redis_client", fake_redis),
        patch("app.callback_security.redis_client", fake_redis),
        patch("app.routers.files.redis_client", fake_redis),
        patch.dict(
            "app.routers.files.PUBLIC_LIMITS",
            {"callback": [RateLimitRule("ip_rpm", limit=1, window_seconds=60)]},
            clear=False,
        ),
    ):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        first = client.post(
            "/files/callback/1",
            content=body,
            headers=_signed_callback_headers(payload, "cb-secret", ts=int(time.time())),
        )
        second = client.post(
            "/files/callback/1",
            content=body,
            headers=_signed_callback_headers(payload, "cb-secret", ts=int(time.time()) + 1),
        )
    app.dependency_overrides.clear()
    assert first.status_code in (200, 404, 409, 403)
    assert second.status_code == 429
    assert second.headers.get("Retry-After") == "60"


def test_callback_critical_returns_503_when_redis_down():
    mock_supabase = MagicMock()
    mock_db = MagicMock()
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1"}
    app.dependency_overrides[get_current_user_optional] = lambda: {"sub": "user-1"}
    payload = {"pdf_id": 1, "status": "completed", "summary": "ok", "user_id": "u1"}
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    with (
        patch("app.routers.files.settings.USE_SUPABASE", True),
        patch("app.callback_security.settings.CALLBACK_SECRET", "cb-secret"),
        patch("app.callback_security.settings.CALLBACK_ALLOWED_CIDRS_RAW", ""),
        patch("app.callback_security.redis_client", None),
    ):
        response = client.post(
            "/files/callback/1",
            content=body,
            headers=_signed_callback_headers(payload, "cb-secret"),
        )
    app.dependency_overrides.clear()
    assert response.status_code == 503


def test_default_endpoint_degraded_returns_429_when_redis_down():
    with (
        patch("app.rate_limit.redis_client", None),
        patch("app.rate_limit._LOCAL_DEGRADED", OrderedDict()),
        patch.dict(
            "app.routers.files.PUBLIC_LIMITS",
            {"summarize_guest": [RateLimitRule("ip_rpm", limit=2, window_seconds=60)]},
            clear=False,
        ),
    ):
        files = {"file": ("x.pdf", b"%PDF-1.4 test", "application/pdf")}
        first = client.post("/files/summarize-guest", files=files)
        second = client.post("/files/summarize-guest", files=files)
    assert first.status_code != 429
    assert second.status_code == 429
