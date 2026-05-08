import hmac


def _sha256_hex_equals_legacy_stored(candidate_hex: str, stored_pw: str) -> bool:
    """Constant-time compare for legacy SHA-256 hex passwords (length mismatch → false)."""
    try:
        return hmac.compare_digest(candidate_hex, str(stored_pw))
    except ValueError:
        return False
