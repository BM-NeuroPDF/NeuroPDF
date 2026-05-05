"""Tests for structured cache logging helpers."""

import logging

import pytest

from app.observability.cache_logger import (
    log_cache,
    log_cache_backend_error,
    log_cache_invalidate,
    redact_cache_key,
)


def test_redact_cache_key_stable_and_no_raw_secret() -> None:
    raw = "user:deadbeef-cafe-babe:files:list:v1"
    a = redact_cache_key(raw)
    b = redact_cache_key(raw)
    assert a == b
    assert a.startswith("h:")
    assert "deadbeef" not in a
    assert raw not in a


def test_redact_cache_key_none() -> None:
    assert redact_cache_key(None) == "none"


def test_log_cache_extra_quoting_and_none_values(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    log_cache(
        "x",
        "k",
        True,
        extra={"spaced": "a b", "nil": None},
    )
    msg = caplog.text
    assert "extra_spaced=" in msg
    assert "extra_nil=none" in msg


def test_log_cache_emits_lookup_hit_and_phase(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    log_cache("summary_cache", "secret|key|material", True, ttl=120, latency_ms=1.5)
    msg = caplog.text
    assert "event=cache_lookup" in msg
    assert "name=summary_cache" in msg
    assert "hit=true" in msg
    assert "phase=cache_hit" in msg
    assert "ttl=120" in msg
    assert "cache_miss" not in msg
    assert "secret" not in msg


def test_log_cache_miss_phase(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    log_cache("my_files_redis", "user:x:files", False, extra={"endpoint": "my_files"})
    assert "phase=cache_miss" in caplog.text
    assert "extra_endpoint=my_files" in caplog.text


def test_log_cache_invalidate(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    log_cache_invalidate("stats_cache_redis", "k1", "k2")
    assert "event=cache_invalidate" in caplog.text
    assert "key_count=2" in caplog.text


def test_log_cache_invalidate_skips_empty_keys(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    log_cache_invalidate("stats_cache_redis")
    assert caplog.text == ""


def test_log_cache_backend_error(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)
    log_cache_backend_error("stats_cache_get_json", "raw-key", error="boom")
    assert "event=cache_backend_error" in caplog.text
    assert "boom" in caplog.text
    assert "raw-key" not in caplog.text
