from email import message_from_string
from email.header import decode_header, make_header
from unittest.mock import MagicMock, patch

import pytest
import smtplib


@pytest.mark.unit
@patch("app.services.email_service.smtplib.SMTP")
def test_send_login_otp_email_skips_without_smtp_user(mock_smtp):
    from app.services.email_service import send_login_otp_email

    with patch("app.services.email_service.settings") as s:
        s.SMTP_USER = ""
        s.SMTP_PASSWORD = "x"
        s.SMTP_HOST = "smtp.gmail.com"
        s.SMTP_PORT = 587
        send_login_otp_email("a@b.com", "123456")
    mock_smtp.assert_not_called()


@pytest.mark.unit
@patch("app.services.email_service.smtplib.SMTP")
def test_send_login_otp_email_skips_whitespace_only_smtp_user(mock_smtp):
    from app.services.email_service import send_login_otp_email

    with patch("app.services.email_service.settings") as s:
        s.SMTP_USER = "   "
        s.SMTP_PASSWORD = "x"
        s.SMTP_HOST = "smtp.gmail.com"
        s.SMTP_PORT = 587
        send_login_otp_email("a@b.com", "123456")
    mock_smtp.assert_not_called()


@pytest.mark.unit
@patch("app.services.email_service.smtplib.SMTP")
def test_send_login_otp_email_sends_via_smtp(mock_smtp_class):
    from app.services.email_service import send_login_otp_email

    mock_server = MagicMock()
    mock_smtp_class.return_value.__enter__.return_value = mock_server

    with patch("app.services.email_service.settings") as s:
        s.SMTP_USER = "from@example.com"
        s.SMTP_PASSWORD = "app-password"
        s.SMTP_HOST = "smtp.gmail.com"
        s.SMTP_PORT = 587
        send_login_otp_email("user@example.com", "999888")

    mock_smtp_class.assert_called_once_with("smtp.gmail.com", 587, timeout=30)
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with("from@example.com", "app-password")
    mock_server.sendmail.assert_called_once()
    args = mock_server.sendmail.call_args[0]
    assert args[0] == "from@example.com"
    assert args[1] == ["user@example.com"]
    parsed = message_from_string(args[2])
    subject_decoded = str(make_header(decode_header(parsed["Subject"])))
    assert subject_decoded == "NeuroPDF - Giriş Doğrulama Kodunuz"
    html_parts = [
        p.get_payload(decode=True).decode("utf-8")
        for p in parsed.walk()
        if p.get_content_type() == "text/html"
    ]
    assert html_parts
    assert "999888" in html_parts[0]


@pytest.mark.unit
@patch("app.services.email_service.logger.exception")
@patch("app.services.email_service.smtplib.SMTP")
def test_send_login_otp_email_logs_on_smtp_error(mock_smtp_class, mock_log_exc):
    from app.services.email_service import send_login_otp_email

    mock_server = MagicMock()
    mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"auth failed")
    mock_smtp_class.return_value.__enter__.return_value = mock_server

    with patch("app.services.email_service.settings") as s:
        s.SMTP_USER = "from@example.com"
        s.SMTP_PASSWORD = "bad"
        s.SMTP_HOST = "smtp.gmail.com"
        s.SMTP_PORT = 587
        send_login_otp_email("user@example.com", "111222")

    mock_log_exc.assert_called_once()
