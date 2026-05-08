from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routers.auth import eula, legacy_constants, password_legacy, user_claims
from app.schemas.auth import AcceptEulaIn


def test_sha256_hex_equals_legacy_stored_true_and_false() -> None:
    assert password_legacy._sha256_hex_equals_legacy_stored("abc", "abc") is True
    assert password_legacy._sha256_hex_equals_legacy_stored("abc", "xyz") is False


def test_sha256_hex_equals_legacy_stored_value_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_value_error(_a: str, _b: str) -> bool:
        raise ValueError("length mismatch")

    monkeypatch.setattr(password_legacy.hmac, "compare_digest", _raise_value_error)
    assert password_legacy._sha256_hex_equals_legacy_stored("a", "b") is False


def test_legacy_constants_values() -> None:
    assert (
        legacy_constants.INVALID_TOKEN_WWW_AUTHENTICATE
        == 'Bearer error="invalid_token"'
    )
    assert legacy_constants.DELETION_OTP_TTL_SECONDS == 600


def test_load_user_claim_material_success() -> None:
    db = MagicMock()
    mapping = MagicMock()
    mapping.first.return_value = {
        "email": "u@example.com",
        "username": "user",
        "eula_accepted": 1,
    }
    db.execute.return_value.mappings.return_value = mapping

    email, username, eula_accepted = user_claims._load_user_claim_material(db, "u1")
    assert email == "u@example.com"
    assert username == "user"
    assert eula_accepted is True


def test_load_user_claim_material_not_found_raises() -> None:
    db = MagicMock()
    db.execute.return_value.mappings.return_value.first.return_value = None
    with pytest.raises(HTTPException) as exc:
        user_claims._load_user_claim_material(db, "missing")
    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid refresh token"


def test_get_eula_delegates_to_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        eula.helpers, "get_eula_content", lambda lang: f"content-{lang}"
    )
    assert eula.get_eula("en") == "content-en"


def test_accept_eula_supabase_branch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eula.settings, "USE_SUPABASE", True)
    invalidated: list[str] = []
    monkeypatch.setattr(
        eula, "invalidate_auth_me_cache", lambda uid: invalidated.append(uid)
    )

    exec_mock = MagicMock()
    eq_mock = MagicMock()
    eq_mock.execute = exec_mock
    update_mock = MagicMock(return_value=eq_mock)
    table_obj = MagicMock(update=update_mock)
    supabase = MagicMock(table=MagicMock(return_value=table_obj))
    db = MagicMock()

    result = eula.accept_eula(
        AcceptEulaIn(accepted=True),
        current_user={"sub": "uid-1"},
        supabase=supabase,
        db=db,
    )
    assert result == {"message": "Success"}
    supabase.table.assert_called_once_with("user_settings")
    update_mock.assert_called_once_with({"eula_accepted": True})
    db.execute.assert_not_called()
    assert invalidated == ["uid-1"]


def test_accept_eula_local_db_branch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eula.settings, "USE_SUPABASE", False)
    invalidated: list[str] = []
    monkeypatch.setattr(
        eula, "invalidate_auth_me_cache", lambda uid: invalidated.append(uid)
    )

    supabase = MagicMock()
    db = MagicMock()
    result = eula.accept_eula(
        AcceptEulaIn(accepted=False),
        current_user={"sub": "uid-2"},
        supabase=supabase,
        db=db,
    )
    assert result == {"message": "Success"}
    db.execute.assert_called_once()
    db.commit.assert_called_once()
    assert invalidated == ["uid-2"]
