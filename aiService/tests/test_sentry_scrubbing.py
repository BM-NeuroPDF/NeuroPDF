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
                "password": "secret",
                "email": "secret@example.com",
                "nested": {"api_key": "k", "safe": "ok"},
            },
            "url": "/api/v1/ai/health",
        }
    }

    sanitized = scrub_event(event, {})

    assert sanitized["request"]["headers"]["authorization"] == MASK
    assert sanitized["request"]["headers"]["cookie"] == MASK
    assert sanitized["request"]["headers"]["x-request-id"] == "req-1"
    assert sanitized["request"]["data"]["password"] == MASK
    assert sanitized["request"]["data"]["email"] == MASK
    assert sanitized["request"]["data"]["nested"]["api_key"] == MASK
    assert sanitized["request"]["data"]["nested"]["safe"] == "ok"
    assert sanitized["tags"]["endpoint_category"] == "low"


def test_scrub_event_sets_critical_and_default_endpoint_tags():
    critical_event = {"request": {"url": "/files/callback/42"}}
    default_event = {"request": {"url": "/api/v1/ai/summarize"}}

    critical = scrub_event(critical_event, {})
    default = scrub_event(default_event, {})

    assert critical["tags"]["endpoint_category"] == "critical"
    assert default["tags"]["endpoint_category"] == "default"


def test_sanitize_pii_handles_lists():
    payload = [{"token": "abc"}, {"safe": "ok"}]
    sanitized = sentry_mod.sanitize_pii(payload)
    assert sanitized[0]["token"] == MASK
    assert sanitized[1]["safe"] == "ok"


def test_init_sentry_noop_when_dsn_empty():
    sentry_mod.init_sentry(SimpleNamespace(SENTRY_DSN=""), "ai-service")


def test_init_sentry_noop_when_sdk_unavailable(monkeypatch):
    original_import = __import__

    def fake_import(name, *args, **kwargs):
        if name.startswith("sentry_sdk"):
            raise ImportError("missing sentry")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)
    sentry_mod.init_sentry(_Settings(), "ai-service")


def test_init_sentry_calls_sdk(monkeypatch):
    calls: dict[str, object] = {}
    fake_sentry_module = SimpleNamespace(
        init=lambda **kwargs: calls.update(kwargs),
    )
    fake_fastapi_module = SimpleNamespace(FastApiIntegration=object)
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sentry_module)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.fastapi", fake_fastapi_module)
    sentry_mod.init_sentry(_Settings(), "ai-service")
    assert calls["dsn"] == _Settings.SENTRY_DSN
    assert calls["environment"] == _Settings.SENTRY_ENV
    assert calls["release"] == "ai-service@abc123"
    assert calls["initial_scope"]["tags"]["service"] == "ai-service"


def test_init_sentry_uses_prod_default_trace_rate_when_empty(monkeypatch):
    calls: dict[str, object] = {}
    fake_sentry_module = SimpleNamespace(
        init=lambda **kwargs: calls.update(kwargs),
    )
    fake_fastapi_module = SimpleNamespace(FastApiIntegration=object)
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sentry_module)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.fastapi", fake_fastapi_module)
    monkeypatch.setenv("ENVIRONMENT", "production")

    settings = SimpleNamespace(
        SENTRY_DSN="https://example.ingest.sentry.io/1",
        SENTRY_ENV="",
        SENTRY_TRACES_SAMPLE_RATE="",
        GIT_SHA="sha-prod",
    )
    sentry_mod.init_sentry(settings, "ai-service")

    assert calls["traces_sample_rate"] == 0.1
