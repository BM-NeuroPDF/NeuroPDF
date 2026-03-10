# app/security_logger.py
"""
Security event logging module for OWASP compliance.
Logs security-related events for monitoring and auditing.
"""
import logging
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import Request

logger = logging.getLogger("security")

# Security event types
EVENT_TYPES = {
    "failed_login": "Failed login attempt",
    "successful_login": "Successful login",
    "rate_limit_exceeded": "Rate limit exceeded",
    "invalid_token": "Invalid or expired token",
    "api_key_failed": "Failed API key authentication",
    "unauthorized_access": "Unauthorized access attempt",
    "suspicious_activity": "Suspicious activity detected",
    "password_reset_request": "Password reset requested",
    "account_locked": "Account locked due to multiple failed attempts",
}


def log_security_event(
    event_type: str,
    user_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None,
    severity: str = "INFO"
):
    """
    Log a security event with structured data.
    
    Args:
        event_type: Type of security event (from EVENT_TYPES)
        user_id: User ID if available
        ip_address: Client IP address
        user_agent: User agent string
        details: Additional event details
        request: FastAPI Request object (will extract IP and user agent if provided)
        severity: Log severity level (INFO, WARNING, ERROR, CRITICAL)
    """
    # Extract information from request if provided
    if request:
        if not ip_address:
            ip_address = request.client.host if request.client else None
        if not user_agent:
            user_agent = request.headers.get("user-agent")
    
    # Build log entry
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "event_description": EVENT_TYPES.get(event_type, "Unknown event"),
        "severity": severity,
        "user_id": user_id,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "details": details or {},
    }
    
    # Log based on severity
    log_message = json.dumps(log_entry, ensure_ascii=False)
    
    if severity == "CRITICAL":
        logger.critical(log_message)
    elif severity == "ERROR":
        logger.error(log_message)
    elif severity == "WARNING":
        logger.warning(log_message)
    else:
        logger.info(log_message)


def log_failed_login(email: str, ip_address: str, user_agent: Optional[str] = None, request: Optional[Request] = None):
    """Convenience function for logging failed login attempts."""
    log_security_event(
        event_type="failed_login",
        ip_address=ip_address,
        user_agent=user_agent,
        details={"email": email},
        request=request,
        severity="WARNING"
    )


def log_successful_login(user_id: str, email: str, ip_address: str, user_agent: Optional[str] = None, request: Optional[Request] = None):
    """Convenience function for logging successful logins."""
    log_security_event(
        event_type="successful_login",
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"email": email},
        request=request,
        severity="INFO"
    )


def log_rate_limit_exceeded(ip_address: str, endpoint: str, user_id: Optional[str] = None, request: Optional[Request] = None):
    """Convenience function for logging rate limit violations."""
    log_security_event(
        event_type="rate_limit_exceeded",
        user_id=user_id,
        ip_address=ip_address,
        details={"endpoint": endpoint},
        request=request,
        severity="WARNING"
    )


def log_invalid_token(ip_address: str, reason: str, request: Optional[Request] = None):
    """Convenience function for logging invalid token attempts."""
    log_security_event(
        event_type="invalid_token",
        ip_address=ip_address,
        details={"reason": reason},
        request=request,
        severity="WARNING"
    )


def log_api_key_failed(ip_address: str, endpoint: str, request: Optional[Request] = None):
    """Convenience function for logging failed API key authentication."""
    log_security_event(
        event_type="api_key_failed",
        ip_address=ip_address,
        details={"endpoint": endpoint},
        request=request,
        severity="WARNING"
    )
