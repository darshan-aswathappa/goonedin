from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import get_settings
import logging

logger = logging.getLogger("VelocityAuth")
settings = get_settings()
security = HTTPBearer()


def validate_token(token: str) -> dict | None:
    """Validate a Supabase JWT and return {user_id, email}, or None if invalid."""
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        email = payload.get("email", "")
        if not user_id:
            return None
        return {"user_id": user_id, "email": email}
    except JWTError as e:
        logger.warning(f"JWT validation failed: {e}")
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """FastAPI dependency — extracts and validates the Bearer JWT."""
    user = validate_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user
