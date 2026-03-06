import asyncio
import logging
import redis.asyncio as aioredis
from dataclasses import dataclass, field
from typing import Optional
from app.core.config import get_settings

logger = logging.getLogger("UserManager")
settings = get_settings()


@dataclass
class UserContext:
    user_id: str
    email: str
    redis_db_index: int
    redis_client: aioredis.Redis
    telegram_bot_token: Optional[str]
    telegram_chat_id: Optional[str]
    hf_task: Optional[asyncio.Task] = field(default=None)
    lf_task: Optional[asyncio.Task] = field(default=None)


# Global registry: user_id -> UserContext
user_registry: dict[str, UserContext] = {}

# Supabase admin client — set during app startup via set_supabase_client()
_supabase_client = None


def set_supabase_client(client) -> None:
    global _supabase_client
    _supabase_client = client


def _make_redis_client(db_index: int) -> aioredis.Redis:
    return aioredis.from_url(
        settings.REDIS_URL,
        db=db_index,
        decode_responses=True,
        max_connections=20,
    )


async def get_or_create_user_context(user_id: str, email: str) -> UserContext:
    """Return the existing UserContext for a user, or create one (with Redis client)."""
    if user_id in user_registry:
        return user_registry[user_id]

    # Query Supabase for this user's config row
    response = await asyncio.to_thread(
        lambda: _supabase_client.table("user_configs")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    if response.data:
        row = response.data[0]
        db_index = row["redis_db_index"]
        telegram_bot_token = row.get("telegram_bot_token")
        telegram_chat_id = row.get("telegram_chat_id")
    else:
        # New user — assign the next available DB index
        max_resp = await asyncio.to_thread(
            lambda: _supabase_client.table("user_configs")
            .select("redis_db_index")
            .order("redis_db_index", desc=True)
            .limit(1)
            .execute()
        )
        db_index = (max_resp.data[0]["redis_db_index"] + 1) if max_resp.data else 0
        await asyncio.to_thread(
            lambda: _supabase_client.table("user_configs")
            .insert({"user_id": user_id, "redis_db_index": db_index})
            .execute()
        )
        telegram_bot_token = None
        telegram_chat_id = None
        logger.info(f"New user {email} registered with Redis DB index {db_index}")

    redis_client = _make_redis_client(db_index)

    # Seed default config values for new users
    from app.core.redis_config import seed_config_if_missing
    await seed_config_if_missing(redis_client)

    ctx = UserContext(
        user_id=user_id,
        email=email,
        redis_db_index=db_index,
        redis_client=redis_client,
        telegram_bot_token=telegram_bot_token,
        telegram_chat_id=telegram_chat_id,
    )
    user_registry[user_id] = ctx
    return ctx


async def update_user_telegram(
    user_id: str, bot_token: Optional[str], chat_id: Optional[str]
) -> None:
    """Update Telegram credentials in Supabase and the in-memory registry."""
    await asyncio.to_thread(
        lambda: _supabase_client.table("user_configs")
        .update({"telegram_bot_token": bot_token, "telegram_chat_id": chat_id})
        .eq("user_id", user_id)
        .execute()
    )
    if user_id in user_registry:
        user_registry[user_id].telegram_bot_token = bot_token
        user_registry[user_id].telegram_chat_id = chat_id


async def load_all_users() -> list[UserContext]:
    """Load all existing users from Supabase on startup. Caller starts scrapers."""
    response = await asyncio.to_thread(
        lambda: _supabase_client.table("user_configs").select("*").execute()
    )
    logger.info(f"Found {len(response.data)} existing user(s) in Supabase")

    contexts = []
    for row in response.data:
        user_id = row["user_id"]
        db_index = row["redis_db_index"]

        redis_client = _make_redis_client(db_index)
        ctx = UserContext(
            user_id=user_id,
            email="",  # filled in on first authenticated request
            redis_db_index=db_index,
            redis_client=redis_client,
            telegram_bot_token=row.get("telegram_bot_token"),
            telegram_chat_id=row.get("telegram_chat_id"),
        )
        user_registry[user_id] = ctx
        contexts.append(ctx)

    return contexts
