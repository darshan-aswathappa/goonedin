"""
API endpoints for per-user Jobright credential management.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.core.auth import get_current_user
from app.core.user_manager import get_supabase_client
from app.services.jobright_credentials import (
    get_jobright_credentials,
    set_jobright_credentials,
    clear_jobright_credentials,
)
from app.services.jobright_session import session_registry, LOGIN_URL, HEADERS
from app.core.config import get_settings
from curl_cffi.requests import AsyncSession

logger = logging.getLogger("JobrightConfig")
router = APIRouter(prefix="/config/jobright-credentials", tags=["jobright"])
settings = get_settings()


class JobrightCredentialsRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_not_empty(cls, v: str) -> str:
        if not v or not v.strip() or "@" not in v:
            raise ValueError("Valid email required")
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Password cannot be empty")
        return v


class JobrightCredentialsResponse(BaseModel):
    configured: bool
    email_masked: Optional[str] = None


def _mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    masked_local = local[:2] + "*" * max(3, len(local) - 2)
    return f"{masked_local}@{domain}"


@router.get("", response_model=JobrightCredentialsResponse)
async def get_credentials(user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    creds = await get_jobright_credentials(supabase, user["user_id"])
    if creds:
        return {"configured": True, "email_masked": _mask_email(creds["email"])}
    return {"configured": False, "email_masked": None}


@router.put("", response_model=JobrightCredentialsResponse)
async def save_credentials(
    body: JobrightCredentialsRequest,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase_client()
    ok = await set_jobright_credentials(
        supabase, user["user_id"], body.email, body.password
    )
    if not ok:
        raise HTTPException(
            status_code=500,
            detail="Failed to save credentials — check backend logs for details",
        )

    session_registry.evict(user["user_id"])
    return {"configured": True, "email_masked": _mask_email(body.email)}


@router.delete("")
async def delete_credentials(user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    ok = await clear_jobright_credentials(supabase, user["user_id"])
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete credentials")
    session_registry.evict(user["user_id"])
    return {"configured": False}


@router.post("/test")
async def test_credentials(
    body: JobrightCredentialsRequest,
    user: dict = Depends(get_current_user),
):
    """
    Attempt a real login to Jobright with the submitted credentials.
    Returns success/failure without saving anything.
    """
    proxy = settings.PROXY_URL
    proxies = {"http": proxy, "https": proxy} if proxy else None

    try:
        async with AsyncSession(
            impersonate="chrome", proxies=proxies, verify=False
        ) as session:
            resp = await session.post(
                LOGIN_URL,
                json={"email": body.email, "password": body.password},
                headers=HEADERS,
                timeout=20,
            )

            set_cookie = resp.headers.get("set-cookie", "")
            sid = None
            if "SESSION_ID=" in set_cookie:
                sid = set_cookie.split("SESSION_ID=")[1].split(";")[0]
            if not sid and resp.cookies:
                sid = resp.cookies.get("SESSION_ID")

            if resp.status_code == 200 and sid:
                try:
                    body_json = resp.json()
                    if body_json.get("success") is True:
                        return {"success": True, "message": "Login successful"}
                    else:
                        error = body_json.get("errorMsg", "Unknown error")
                        return {"success": False, "message": f"Login rejected: {error}"}
                except Exception:
                    return {"success": True, "message": "Login successful"}
            else:
                error_msg = "Unknown error"
                try:
                    body_json = resp.json()
                    error_msg = body_json.get("errorMsg", str(body_json))
                except Exception:
                    error_msg = resp.text[:200]
                return {
                    "success": False,
                    "message": f"Login failed (HTTP {resp.status_code}): {error_msg}",
                }

    except Exception as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}
