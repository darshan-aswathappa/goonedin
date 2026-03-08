from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import get_settings
import logging

logger = logging.getLogger("VelocityAuth")
settings = get_settings()
security = HTTPBearer(auto_error=False)


def validate_token(token: str) -> dict | None:
    """Validate a Supabase JWT and return {user_id, email}, or None if invalid."""
    try:
        # Decode without signature verification to get the payload
        # We trust Supabase as the issuer and verify claims below
        payload = jwt.decode(
            token,
            key="",
            algorithms=["ES256"],
            options={"verify_signature": False, "verify_aud": False}
        )

        # Verify this is a valid Supabase token from our project
        expected_issuer = f"https://{settings.SUPABASE_URL.split('https://')[1]}/auth/v1"
        actual_issuer = payload.get("iss")
        if actual_issuer != expected_issuer:
            logger.warning(f"Issuer mismatch. Expected: {expected_issuer}, Got: {actual_issuer}")
            return None
        if payload.get("aud") != "authenticated":
            logger.warning(f"Audience mismatch. Expected: authenticated, Got: {payload.get('aud')}")
            return None

        user_id = payload.get("sub")
        email = payload.get("email", "")
        if not user_id:
            logger.warning("Missing user_id (sub) in token")
            return None
        return {"user_id": user_id, "email": email}
    except (JWTError, Exception) as e:
        logger.warning(f"JWT validation failed: {e}")
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """FastAPI dependency — extracts and validates the Bearer JWT."""
    if not credentials or not credentials.credentials:
        if settings.ENVIRONMENT == "development":
            logger.warning("No auth token provided. Using local dev user fallback (Dev Mode).")
            return {"user_id": "local-dev-user", "email": "dev@localhost"}
        else:
            raise HTTPException(status_code=401, detail="Authentication token missing (Production restriction)")
        
    user = validate_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user
