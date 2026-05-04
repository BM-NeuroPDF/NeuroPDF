"""Send transactional email via SMTP (OTP, etc.)."""

from __future__ import annotations

import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import settings

logger = logging.getLogger(__name__)


def send_login_otp_email(to_email: str, code: str) -> None:
    """
    Send a 6-digit login OTP as HTML email. No-op when SMTP_USER is unset (e.g. CI).
    Exceptions are logged; callers in BackgroundTasks must not surface details to clients.
    """
    smtp_user = (settings.SMTP_USER or "").strip()
    if not smtp_user:
        return

    safe_email = html.escape(to_email)
    safe_code = html.escape(code)
    subject = "NeuroPDF - Giriş Doğrulama Kodunuz"
    body_html = f"""<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:420px;background:#1e293b;border-radius:16px;padding:32px 28px;">
        <tr><td style="color:#e2e8f0;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;font-size:18px;font-weight:600;">Giriş doğrulama</p>
          <p style="margin:0 0 24px;opacity:0.9;">NeuroPDF oturumunuzu tamamlamak için bu kodu kullanın. Birkaç dakika içinde sona erer.</p>
          <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;">Kodunuz</p>
          <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#38bdf8;">{safe_code}</p>
          <p style="margin:28px 0 0;font-size:13px;color:#94a3b8;">Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
          <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Bu ileti {safe_email} adresine gönderildi.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(smtp_user, settings.SMTP_PASSWORD)
            smtp.sendmail(smtp_user, [to_email], msg.as_string())
    except Exception:
        logger.exception("SMTP OTP email failed for recipient")


def send_deletion_otp_email(to_email: str, code: str) -> None:
    """
    Send account-deletion confirmation OTP. No-op when SMTP_USER is unset (e.g. CI).
    """
    smtp_user = (settings.SMTP_USER or "").strip()
    if not smtp_user:
        return

    safe_email = html.escape(to_email)
    safe_code = html.escape(code)
    subject = "NeuroPDF - Hesap silme doğrulama kodu"
    body_html = f"""<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:420px;background:#1e293b;border-radius:16px;padding:32px 28px;">
        <tr><td style="color:#e2e8f0;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;font-size:18px;font-weight:600;">Hesap silme</p>
          <p style="margin:0 0 24px;opacity:0.9;">Hesabınızı kalıcı olarak silmek için bu kodu kullanın. Bir süre içinde sona erer.</p>
          <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;">Kodunuz</p>
          <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#f87171;">{safe_code}</p>
          <p style="margin:28px 0 0;font-size:13px;color:#94a3b8;">Bu isteği siz yapmadıysanız hesabınızı silmeyin ve destek ile iletişime geçin.</p>
          <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Bu ileti {safe_email} adresine gönderildi.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(smtp_user, settings.SMTP_PASSWORD)
            smtp.sendmail(smtp_user, [to_email], msg.as_string())
    except Exception:
        logger.exception("SMTP deletion OTP email failed for recipient")
