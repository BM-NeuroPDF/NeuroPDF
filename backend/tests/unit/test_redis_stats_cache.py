"""Unit tests for stats cache helpers in redis_client."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.redis_client import (
    GLOBAL_STATS_CACHE_KEY,
    invalidate_stats_caches_for_user,
    stats_cache_delete_keys,
    stats_cache_get_json,
    stats_cache_set_json,
    user_stats_cache_key,
)


def test_user_stats_cache_key_format():
    assert user_stats_cache_key("abc") == "user_stats:abc"


def test_stats_cache_get_json_no_client():
    with patch("app.redis_client.redis_client", None):
        assert stats_cache_get_json("k") is None


def test_stats_cache_get_json_hit():
    mock_r = MagicMock()
    mock_r.get.return_value = '{"a": 1}'
    with patch("app.redis_client.redis_client", mock_r):
        assert stats_cache_get_json("k") == {"a": 1}
    mock_r.get.assert_called_once_with("k")


def test_stats_cache_get_json_miss():
    mock_r = MagicMock()
    mock_r.get.return_value = None
    with patch("app.redis_client.redis_client", mock_r):
        assert stats_cache_get_json("k") is None


def test_stats_cache_get_json_invalid_json():
    mock_r = MagicMock()
    mock_r.get.return_value = "not-json"
    with patch("app.redis_client.redis_client", mock_r):
        assert stats_cache_get_json("k") is None


def test_stats_cache_get_json_redis_error():
    mock_r = MagicMock()
    mock_r.get.side_effect = OSError("boom")
    with patch("app.redis_client.redis_client", mock_r):
        assert stats_cache_get_json("k") is None


def test_stats_cache_set_json_no_client():
    with patch("app.redis_client.redis_client", None):
        stats_cache_set_json("k", {"x": 1}, 10)  # no raise


def test_stats_cache_set_json_success():
    mock_r = MagicMock()
    with patch("app.redis_client.redis_client", mock_r):
        stats_cache_set_json("k", {"x": 1}, 30)
    mock_r.setex.assert_called_once()
    args, _kw = mock_r.setex.call_args
    assert args[0] == "k"
    assert args[1] == 30
    assert '"x": 1' in args[2]


def test_stats_cache_set_json_redis_error():
    mock_r = MagicMock()
    mock_r.setex.side_effect = OSError("boom")
    with patch("app.redis_client.redis_client", mock_r):
        stats_cache_set_json("k", {"x": 1}, 30)  # no raise


def test_stats_cache_delete_keys_no_client():
    with patch("app.redis_client.redis_client", None):
        stats_cache_delete_keys("a", "b")  # no raise


def test_stats_cache_delete_keys_empty():
    mock_r = MagicMock()
    with patch("app.redis_client.redis_client", mock_r):
        stats_cache_delete_keys()
    mock_r.delete.assert_not_called()


def test_stats_cache_delete_keys_success():
    mock_r = MagicMock()
    with patch("app.redis_client.redis_client", mock_r):
        stats_cache_delete_keys("a", GLOBAL_STATS_CACHE_KEY)
    mock_r.delete.assert_called_once_with("a", GLOBAL_STATS_CACHE_KEY)


def test_stats_cache_delete_keys_error():
    mock_r = MagicMock()
    mock_r.delete.side_effect = OSError("boom")
    with patch("app.redis_client.redis_client", mock_r):
        stats_cache_delete_keys("a")  # no raise


def test_invalidate_skips_guest():
    mock_r = MagicMock()
    with patch("app.redis_client.redis_client", mock_r):
        invalidate_stats_caches_for_user("guest-1")
    mock_r.delete.assert_not_called()


def test_invalidate_deletes_user_and_global():
    mock_r = MagicMock()
    with patch("app.redis_client.redis_client", mock_r):
        invalidate_stats_caches_for_user("user-1")
    mock_r.delete.assert_called_once_with(
        user_stats_cache_key("user-1"), GLOBAL_STATS_CACHE_KEY
    )
