from unittest.mock import MagicMock, patch

import pytest

from app.core.redis_otp import (
    RedisOtpUnavailable,
    delete_redis_otp,
    get_redis_otp,
    set_redis_otp,
)


@pytest.mark.asyncio
async def test_set_redis_otp_success():
    mock_redis = MagicMock()
    with patch("app.core.redis_otp.redis_client", mock_redis):
        await set_redis_otp("u1", "hash", ttl_seconds=120)
    mock_redis.setex.assert_called_once()


@pytest.mark.asyncio
async def test_set_redis_otp_uses_config_ttl_when_none():
    mock_redis = MagicMock()
    mock_settings = MagicMock()
    mock_settings.OTP_EMAIL_TTL_SECONDS = 90
    with patch("app.core.redis_otp.redis_client", mock_redis):
        with patch("app.core.redis_otp.settings", mock_settings):
            await set_redis_otp("u1", "hash", ttl_seconds=None)
    _, ttl, _ = mock_redis.setex.call_args[0]
    assert ttl == 90


@pytest.mark.asyncio
async def test_set_redis_otp_ttl_clamped_to_minimum_sixty():
    mock_redis = MagicMock()
    mock_settings = MagicMock()
    mock_settings.OTP_EMAIL_TTL_SECONDS = 30
    with patch("app.core.redis_otp.redis_client", mock_redis):
        with patch("app.core.redis_otp.settings", mock_settings):
            await set_redis_otp("u1", "hash", ttl_seconds=None)
    _, ttl, _ = mock_redis.setex.call_args[0]
    assert ttl == 60


@pytest.mark.asyncio
async def test_set_redis_otp_no_client():
    with patch("app.core.redis_otp.redis_client", None):
        with pytest.raises(RedisOtpUnavailable):
            await set_redis_otp("u1", "hash")


@pytest.mark.asyncio
async def test_set_redis_otp_setex_raises():
    mock_redis = MagicMock()
    mock_redis.setex.side_effect = OSError("unavailable")
    with patch("app.core.redis_otp.redis_client", mock_redis):
        with pytest.raises(RedisOtpUnavailable):
            await set_redis_otp("u1", "hash")


@pytest.mark.asyncio
async def test_get_redis_otp_no_client():
    with patch("app.core.redis_otp.redis_client", None):
        assert await get_redis_otp("u1") is None


@pytest.mark.asyncio
async def test_get_redis_otp_returns_value():
    mock_redis = MagicMock()
    mock_redis.get.return_value = "stored_hash"
    with patch("app.core.redis_otp.redis_client", mock_redis):
        assert await get_redis_otp("u1") == "stored_hash"


@pytest.mark.asyncio
async def test_get_redis_otp_error_returns_none():
    mock_redis = MagicMock()
    mock_redis.get.side_effect = OSError("unavailable")
    with patch("app.core.redis_otp.redis_client", mock_redis):
        assert await get_redis_otp("u1") is None


@pytest.mark.asyncio
async def test_delete_redis_otp_no_client():
    with patch("app.core.redis_otp.redis_client", None):
        await delete_redis_otp("u1")


@pytest.mark.asyncio
async def test_delete_redis_otp_calls_delete():
    mock_redis = MagicMock()
    with patch("app.core.redis_otp.redis_client", mock_redis):
        await delete_redis_otp("u1")
    mock_redis.delete.assert_called_once()


@pytest.mark.asyncio
async def test_delete_redis_otp_delete_error_swallowed():
    mock_redis = MagicMock()
    mock_redis.delete.side_effect = OSError("unavailable")
    with patch("app.core.redis_otp.redis_client", mock_redis):
        await delete_redis_otp("u1")
