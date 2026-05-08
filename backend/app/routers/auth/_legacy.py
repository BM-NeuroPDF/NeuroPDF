"""Facade for legacy auth routes: preserves patch targets on ``app.routers.auth._legacy``."""

from ...rate_limit import (
    check_rate_limit,
    is_2fa_verify_locked,
    record_2fa_verify_failure,
    clear_2fa_verify_failures,
)
from ...core.redis_otp import (
    RedisOtpUnavailable,
    delete_redis_otp,
    get_redis_otp,
    set_redis_otp,
)
from ...services.email_service import send_deletion_otp_email, send_login_otp_email
from ...core import security
from ...repositories.user_repo import UserRepository
from ...config import settings

user_repo = UserRepository()

from .legacy_constants import DELETION_OTP_TTL_SECONDS, INVALID_TOKEN_WWW_AUTHENTICATE  # noqa: E402
from .token_service import (  # noqa: E402
    _set_refresh_cookie,
    _clear_refresh_cookie,
    _issue_auth_out,
    _extract_refresh_token,
)
from .user_claims import _load_user_claim_material  # noqa: E402
from .password_legacy import _sha256_hex_equals_legacy_stored  # noqa: E402
from .legacy_handlers import router  # noqa: E402

__all__ = [
    "router",
    "user_repo",
    "check_rate_limit",
    "set_redis_otp",
    "get_redis_otp",
    "delete_redis_otp",
    "send_login_otp_email",
    "send_deletion_otp_email",
    "security",
    "settings",
    "RedisOtpUnavailable",
    "is_2fa_verify_locked",
    "record_2fa_verify_failure",
    "clear_2fa_verify_failures",
    "INVALID_TOKEN_WWW_AUTHENTICATE",
    "DELETION_OTP_TTL_SECONDS",
    "_set_refresh_cookie",
    "_clear_refresh_cookie",
    "_issue_auth_out",
    "_extract_refresh_token",
    "_load_user_claim_material",
    "_sha256_hex_equals_legacy_stored",
]
