import sys
from types import SimpleNamespace

from app.observability.sentry import MASK, scrub_event
from app.observability import sentry as sentry_mod


class _Settings:
    SENTRY_DSN = "https://example.ingest.sentry.io/1"
    SENTRY_ENV = "test"
    SENTRY_TRACES_SAMPLE_RATE = 0.0
    GIT_SHA = "abc123"


def test_scrub_event_filters_headers_and_body():
    event = {
        "request": {
            "headers": {
                "authorization": "Bearer abc",
                "cookie": "session=abc",
                "x-request-id": "req-1",
            },
            "data": {
                "password": "super-secret",
                "email": "e@example.com",
                "nested": {"refresh_token": "123", "note": "ok"},
            },
            "url": "/files/callback/1",
        },
        "user": {"email": "test@example.com", "username": "foo", "id": "u1"},
    }

    sanitized = scrub_event(event, {})

    assert sanitized["request"]["headers"]["authorization"] == MASK
    assert sanitized["request"]["headers"]["cookie"] == MASK
    assert sanitized["request"]["headers"]["x-request-id"] == "req-1"
    assert sanitized["request"]["data"]["password"] == MASK
    assert sanitized["request"]["data"]["email"] == MASK
    assert sanitized["request"]["data"]["nested"]["refresh_token"] == MASK
    assert sanitized["request"]["data"]["nested"]["note"] == "ok"
    assert sanitized["user"]["email"] == MASK
    assert sanitized["user"]["username"] == MASK
    assert sanitized["user"]["id"] == "u1"
    assert sanitized["tags"]["endpoint_category"] == "critical"


def test_sanitize_pii_handles_list_payload():
    payload = [{"token": "abc"}, {"safe": "ok"}]
    sanitized = sentry_mod.sanitize_pii(payload)
    assert sanitized[0]["token"] == MASK
    assert sanitized[1]["safe"] == "ok"


def test_init_sentry_noop_when_dsn_empty():
    sentry_mod.init_sentry(SimpleNamespace(SENTRY_DSN=""), "backend")


def test_init_sentry_noop_when_sdk_unavailable(monkeypatch):
    original_import = __import__

    def fake_import(name, *args, **kwargs):
        if name.startswith("sentry_sdk"):
            raise ImportError("missing sentry")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)
    sentry_mod.init_sentry(_Settings(), "backend")


def test_init_sentry_calls_sdk(monkeypatch):
    calls: dict[str, object] = {}
    fake_sentry_module = SimpleNamespace(
        init=lambda **kwargs: calls.update(kwargs),
    )
    fake_fastapi_module = SimpleNamespace(FastApiIntegration=object)

    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sentry_module)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.fastapi", fake_fastapi_module)

    sentry_mod.init_sentry(_Settings(), "backend")

    assert calls["dsn"] == _Settings.SENTRY_DSN
    assert calls["environment"] == _Settings.SENTRY_ENV
    assert calls["release"] == "backend@abc123"
    assert calls["initial_scope"]["tags"]["service"] == "backend"
