from __future__ import annotations

from app.config import settings
from app.models import RefreshToken
from app.services.refresh_token_service import issue_refresh_token


def test_refresh_rotation_success_and_cookie(
    test_client, test_db, test_user_with_auth, monkeypatch
):
    user, _ = test_user_with_auth
    monkeypatch.setattr(settings, "REFRESH_TOKENS_ENABLED", True)
    issued = issue_refresh_token(test_db, user_id=user.id)
    test_db.commit()

    response = test_client.post(
        "/auth/refresh",
        json={"refresh_token": issued.token},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == user.id
    assert body["access_token"]
    assert settings.REFRESH_COOKIE_NAME in response.cookies

    row = test_db.query(RefreshToken).filter(RefreshToken.jti == issued.jti).first()
    assert row is not None
    assert row.revoked_at is not None


def test_refresh_reuse_detection_revokes_all(test_client, test_db, test_user_with_auth, monkeypatch):
    user, _ = test_user_with_auth
    monkeypatch.setattr(settings, "REFRESH_TOKENS_ENABLED", True)
    issued = issue_refresh_token(test_db, user_id=user.id)
    another = issue_refresh_token(test_db, user_id=user.id)
    test_db.commit()

    ok = test_client.post("/auth/refresh", json={"refresh_token": issued.token})
    assert ok.status_code == 200

    reuse = test_client.post("/auth/refresh", json={"refresh_token": issued.token})
    assert reuse.status_code == 401
    assert "reuse" in reuse.json()["detail"].lower()

    rows = (
        test_db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id)
        .order_by(RefreshToken.id.asc())
        .all()
    )
    assert len(rows) >= 2
    assert all(r.revoked_at is not None for r in rows)
    assert another.jti in {r.jti for r in rows}


def test_logout_all_revokes_all_tokens(test_client, test_db, test_user_with_auth, auth_headers, monkeypatch):
    user, _ = test_user_with_auth
    monkeypatch.setattr(settings, "REFRESH_TOKENS_ENABLED", True)
    issue_refresh_token(test_db, user_id=user.id)
    issue_refresh_token(test_db, user_id=user.id)
    test_db.commit()

    response = test_client.post("/auth/logout-all", headers=auth_headers)
    assert response.status_code == 200

    rows = test_db.query(RefreshToken).filter(RefreshToken.user_id == user.id).all()
    assert len(rows) == 2
    assert all(r.revoked_at is not None for r in rows)


def test_logout_revokes_provided_refresh_token(
    test_client, test_db, test_user_with_auth, monkeypatch
):
    user, _ = test_user_with_auth
    monkeypatch.setattr(settings, "REFRESH_TOKENS_ENABLED", True)
    issued = issue_refresh_token(test_db, user_id=user.id)
    test_db.commit()

    response = test_client.post("/auth/logout", json={"refresh_token": issued.token})
    assert response.status_code == 200

    row = test_db.query(RefreshToken).filter(RefreshToken.jti == issued.jti).first()
    assert row is not None
    assert row.revoked_at is not None
