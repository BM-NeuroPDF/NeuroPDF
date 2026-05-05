"""
Unit tests for rate limiting functionality
"""

from collections import OrderedDict
from unittest.mock import Mock, patch, MagicMock

import pytest
from fastapi import HTTPException
from fastapi import Request
from app.rate_limit import (
    check_rate_limit,
    is_2fa_verify_locked,
    record_2fa_verify_failure,
    clear_2fa_verify_failures,
)


class TestRateLimit:
    """Test rate limiting functionality"""

    def test_rate_limit_disabled(self):
        """Test that rate limiting returns True when disabled"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        with patch("app.rate_limit.settings") as mock_settings:
            mock_settings.RATE_LIMIT_ENABLED = False
            result = check_rate_limit(request, "test", 10, 60)
            assert result is True

    def test_rate_limit_no_redis(self):
        """Test that rate limiting returns True when Redis is unavailable"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", None),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)
            assert result is True

    def test_rate_limit_first_request(self):
        """Test that first request is allowed"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        mock_redis = MagicMock()
        mock_redis.get.return_value = None

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)

            assert result is True
            mock_redis.setex.assert_called_once()

    def test_rate_limit_within_limit(self):
        """Test that requests within limit are allowed"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        mock_redis = MagicMock()
        mock_redis.get.return_value = "5"  # 5 requests so far

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)

            assert result is True
            mock_redis.incr.assert_called_once()

    def test_rate_limit_exceeded(self):
        """Test that requests exceeding limit are blocked"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        mock_redis = MagicMock()
        mock_redis.get.return_value = "10"  # Already at limit

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)

            assert result is False
            mock_redis.incr.assert_not_called()

    def test_critical_endpoint_fails_closed_when_no_redis(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", None),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            with pytest.raises(HTTPException) as exc_info:
                check_rate_limit(request, "auth:login", 10, 60, "critical")
            assert exc_info.value.status_code == 503

    def test_default_endpoint_degraded_to_local_limit_when_no_redis(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", None),
            patch("app.rate_limit._LOCAL_DEGRADED", OrderedDict()),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            # degraded limit = ceil(2/2)=1 => second blocked
            assert check_rate_limit(request, "files:upload", 2, 60, "default") is True
            assert check_rate_limit(request, "files:upload", 2, 60, "default") is False

    def test_low_endpoint_allows_when_no_redis_and_records_sentry(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"
        mock_sentry = MagicMock()

        with (
            patch("app.rate_limit.settings") as mock_settings,
            patch("app.rate_limit.redis_client", None),
            patch.dict("sys.modules", {"sentry_sdk": mock_sentry}),
        ):
            mock_settings.RATE_LIMIT_ENABLED = True
            assert check_rate_limit(request, "files:global_stats", 30, 60, "low") is True
            assert mock_sentry.add_breadcrumb.called
            assert mock_sentry.capture_message.called


class TestTwoFaVerifyRateLimit:
    def test_is_locked_disabled(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "1.2.3.4"
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", None),
        ):
            s.RATE_LIMIT_ENABLED = True
            assert is_2fa_verify_locked(request) is False

    def test_is_locked_when_count_high(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "1.2.3.4"
        mock_redis = MagicMock()
        mock_redis.get.return_value = "3"
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            s.VERIFY_2FA_MAX_FAILS = 3
            assert is_2fa_verify_locked(request) is True

    def test_not_locked_when_fail_key_missing(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "1.2.3.4"
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            s.VERIFY_2FA_MAX_FAILS = 3
            assert is_2fa_verify_locked(request) is False

    def test_not_locked_when_count_below_max(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "1.2.3.4"
        mock_redis = MagicMock()
        mock_redis.get.return_value = "2"
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            s.VERIFY_2FA_MAX_FAILS = 3
            assert is_2fa_verify_locked(request) is False

    def test_is_locked_redis_get_raises(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "1.2.3.4"
        mock_redis = MagicMock()
        mock_redis.get.side_effect = RuntimeError("redis down")
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            assert is_2fa_verify_locked(request) is False

    def test_record_failure_when_rate_limit_disabled(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "9.9.9.9"
        mock_redis = MagicMock()
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = False
            record_2fa_verify_failure(request)
            mock_redis.incr.assert_not_called()

    def test_record_failure_when_no_redis(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "9.9.9.9"
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", None),
        ):
            s.RATE_LIMIT_ENABLED = True
            record_2fa_verify_failure(request)

    def test_record_failure_sets_ttl_on_first(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "9.9.9.9"
        mock_redis = MagicMock()
        mock_redis.incr.return_value = 1
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            s.VERIFY_2FA_LOCKOUT_SECONDS = 180
            record_2fa_verify_failure(request)
            mock_redis.expire.assert_called_once()

    def test_record_failure_redis_raises(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "9.9.9.9"
        mock_redis = MagicMock()
        mock_redis.incr.side_effect = RuntimeError("down")
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", mock_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            record_2fa_verify_failure(request)

    def test_clear_failures_no_redis(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "9.9.9.9"
        with patch("app.rate_limit.redis_client", None):
            clear_2fa_verify_failures(request)

    def test_clear_failures_redis_delete_raises(self):
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "9.9.9.9"
        mock_redis = MagicMock()
        mock_redis.delete.side_effect = OSError("down")
        with patch("app.rate_limit.redis_client", mock_redis):
            clear_2fa_verify_failures(request)
