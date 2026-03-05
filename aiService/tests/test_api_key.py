"""
Unit tests for aiService API key authentication (deps.py)

OWASP A01/A02: Bu testler OWASP güvenlik güncellemesinin doğru çalıştığını
doğrular - API Key bypass açığının kapatıldığını kontrol eder.
"""
import pytest
from unittest.mock import patch
from fastapi import HTTPException


class TestVerifyApiKey:
    """
    verify_api_key dependency'sini test eder.

    Senaryo haritası:
    1. Sunucu AI_SERVICE_API_KEY olmadan çalışırsa → 500
    2. İstek X-API-Key header'ı göndermezse → 401
    3. İstek yanlış API Key gönderirse → 403
    4. İstek doğru API Key gönderirse → True (başarı)
    """

    def _call_verify(self, api_key_setting: str, request_key: str):
        """Helper: settings ve request header'ı mock'layarak verify_api_key'i çağırır."""
        from app.deps import verify_api_key
        with patch("app.deps.settings") as mock_settings:
            mock_settings.AI_SERVICE_API_KEY = api_key_setting
            return verify_api_key(x_api_key=request_key)

    # -------------------------------------------------------
    # A02: Security Misconfiguration — Sunucu yanlış yapılandırılmış
    # -------------------------------------------------------
    def test_no_server_api_key_raises_500(self):
        """
        Sunucuda AI_SERVICE_API_KEY yoksa, herhangi bir istekte 500 dönmeli.
        (Eski kodda bypass vardı - bu güvenlik açığını kapattık.)
        """
        with pytest.raises(HTTPException) as exc_info:
            self._call_verify(api_key_setting="", request_key="anything")
        assert exc_info.value.status_code == 500
        assert "misconfigured" in exc_info.value.detail.lower()

    # -------------------------------------------------------
    # A01: Broken Access Control — Token olmadan erişim denemesi
    # -------------------------------------------------------
    def test_missing_request_key_raises_401(self):
        """Request'te X-API-Key header yoksa 401 dönmeli."""
        with pytest.raises(HTTPException) as exc_info:
            self._call_verify(api_key_setting="secret-key-123", request_key=None)
        assert exc_info.value.status_code == 401
        assert "required" in exc_info.value.detail.lower()

    def test_empty_request_key_raises_401(self):
        """Boş string X-API-Key gönderilirse 401 dönmeli."""
        with pytest.raises(HTTPException) as exc_info:
            self._call_verify(api_key_setting="secret-key-123", request_key="")
        assert exc_info.value.status_code == 401

    # -------------------------------------------------------
    # A01: Broken Access Control — Yanlış token ile erişim
    # -------------------------------------------------------
    def test_invalid_request_key_raises_403(self):
        """Yanlış API Key gönderilirse 403 dönmeli."""
        with pytest.raises(HTTPException) as exc_info:
            self._call_verify(api_key_setting="secret-key-123", request_key="wrong-key")
        assert exc_info.value.status_code == 403
        assert "invalid" in exc_info.value.detail.lower()

    # -------------------------------------------------------
    # Başarılı Senaryo
    # -------------------------------------------------------
    def test_valid_api_key_returns_true(self):
        """Doğru API Key ile istek başarıyla doğrulanmalı."""
        result = self._call_verify(api_key_setting="secret-key-123", request_key="secret-key-123")
        assert result is True

    def test_api_key_is_case_sensitive(self):
        """API Key büyük/küçük harf duyarlı olmalı (güvenlik)."""
        with pytest.raises(HTTPException) as exc_info:
            self._call_verify(api_key_setting="Secret-Key-123", request_key="secret-key-123")
        assert exc_info.value.status_code == 403
