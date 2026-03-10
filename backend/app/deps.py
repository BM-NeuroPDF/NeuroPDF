# app/auth.py
from typing import Annotated, Optional
from fastapi import HTTPException, status, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import jwt
from app.config import settings
from app.db import get_db

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

def get_current_user(credentials: Annotated[HTTPAuthorizationCredentials, Security(security)]):
    """
    Bu fonksiyon:
    1. İstekten 'Authorization: Bearer <token>' başlığını otomatik okur.
    2. 'Bearer ' kısmını atar ve ham token'ı alır.
    3. Token'ın süresini ve imzasını doğrular.
    4. Geçerliyse kullanıcı verisini (payload) döndürür.
    """
    token = credentials.credentials

    try:
        # Token'ı çözümle (Decode)
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET, 
            algorithms=["HS256"]
        )
        return payload  # Örn: {'sub': '123', 'email': 'test@example.com', ...}

    except jwt.ExpiredSignatureError:
        # Token'ın süresi dolmuşsa (Exp)
        # Security logging
        try:
            from .security_logger import log_invalid_token
            from fastapi import Request
            # Try to get request from context if available
            log_invalid_token(
                ip_address=None,  # Will be extracted from request if available
                reason="Token expired",
                request=None
            )
        except Exception:
            pass  # Don't fail if logging fails
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        # Token bozuksa veya imza geçersizse
        # Security logging
        try:
            from .security_logger import log_invalid_token
            log_invalid_token(
                ip_address=None,
                reason="Invalid token signature",
                request=None
            )
        except Exception:
            pass  # Don't fail if logging fails
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_current_user_optional(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Security(security_optional)] = None
) -> Optional[dict]:
    """
    Optional authentication dependency.
    Returns user payload if token is valid, None if no token or invalid.
    Used for endpoints that support both authenticated and guest users.
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"]
        )
        return payload
    except jwt.PyJWTError:
        # Invalid token, return None (guest user)
        return None


def require_role(required_role: str):
    """
    Role-based access control dependency factory.
    Returns a dependency that checks if the current user has the required role.
    
    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(
            current_user: dict = Depends(require_role("admin"))
        ):
            ...
    """
    def role_checker(
        current_user: dict = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        from app.models import User
        
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID not found in token"
            )
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check role
        role_name = user.role.name if user.role else None
        if role_name != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {required_role}"
            )
        
        return current_user
    
    return role_checker