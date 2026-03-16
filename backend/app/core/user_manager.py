import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional, Any
from app.core.config import get_settings

logger = logging.getLogger("UserManager")
settings = get_settings()


@dataclass
class UserContext:
    user_id: str
    email: str
    hf_task: Optional[asyncio.Task] = field(default=None)
    lf_task: Optional[asyncio.Task] = field(default=None)
    custom_sources_task: Optional[asyncio.Task] = field(default=None)
    location_task: Optional[asyncio.Task] = field(default=None)
    indeed_task: Optional[asyncio.Task] = field(default=None)


# Global registry: user_id -> UserContext
user_registry: dict[str, UserContext] = {}

# Supabase admin client — set during app startup via set_supabase_client()
_supabase_client: Any = None


def set_supabase_client(client: Any) -> None:
    global _supabase_client
    _supabase_client = client


def get_supabase_client() -> Any:
    return _supabase_client


async def get_or_create_user_context(user_id: str, email: str) -> UserContext:
    """Return the existing UserContext for a user, or create one."""
    if user_id in user_registry:
        return user_registry[user_id]

    # Query Supabase for this user's config row
    response = await asyncio.to_thread(
        lambda: _supabase_client.table("user_configs")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        # New user — insert config row
        await asyncio.to_thread(
            lambda: _supabase_client.table("user_configs")
            .insert({"user_id": user_id})
            .execute()
        )
        logger.info(f"New user {email} registered")

    # Seed user settings (keywords, blocked companies, etc.)
    from app.core.supabase_config import seed_settings_if_missing
    await seed_settings_if_missing(_supabase_client, user_id)

    ctx = UserContext(
        user_id=user_id,
        email=email,
    )
    user_registry[user_id] = ctx
    return ctx


async def load_all_users() -> list[UserContext]:
    """Load all existing users from Supabase on startup. Caller starts scrapers."""
    response = await asyncio.to_thread(
        lambda: _supabase_client.table("user_configs").select("*").execute()
    )
    logger.info(f"Found {len(response.data)} existing user(s) in Supabase")

    contexts = []
    for row in response.data:
        user_id = row["user_id"]

        # Seed settings for existing users too
        from app.core.supabase_config import seed_settings_if_missing
        await seed_settings_if_missing(_supabase_client, user_id)

        ctx = UserContext(
            user_id=user_id,
            email="",  # filled in on first authenticated request
        )
        user_registry[user_id] = ctx
        contexts.append(ctx)

    return contexts
