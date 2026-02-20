import logging
import asyncio
import json
from datetime import datetime, timezone
from typing import Callable, Awaitable, Optional
import redis.asyncio as aioredis

LOG_HISTORY_KEY = "system_logs"
LOG_TTL_SECONDS = 6 * 60 * 60  # 6 hours
MAX_STORED_LOGS = 1000


class BroadcastLogHandler(logging.Handler):
    """
    Custom log handler that broadcasts log messages via a callback function
    and stores them in Redis for historical access.
    """

    def __init__(
        self,
        broadcast_callback: Callable[[dict], Awaitable[None]],
        redis_client: Optional[aioredis.Redis] = None,
    ):
        super().__init__()
        self.broadcast_callback = broadcast_callback
        self.redis_client = redis_client
        self.setFormatter(logging.Formatter("%(message)s"))

    def set_redis_client(self, redis_client: aioredis.Redis):
        self.redis_client = redis_client

    def emit(self, record: logging.LogRecord):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": self.format(record),
            "logger": record.name,
        }

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._handle_log(log_entry))
        except RuntimeError:
            pass

    async def _handle_log(self, log_entry: dict):
        await self.broadcast_callback(log_entry)

        if self.redis_client:
            try:
                await self.redis_client.lpush(LOG_HISTORY_KEY, json.dumps(log_entry))
                await self.redis_client.ltrim(LOG_HISTORY_KEY, 0, MAX_STORED_LOGS - 1)
                await self.redis_client.expire(LOG_HISTORY_KEY, LOG_TTL_SECONDS)
            except Exception:
                pass


async def get_historical_logs(redis_client: aioredis.Redis, limit: int = 500) -> list:
    """Fetch historical logs from Redis."""
    try:
        raw_logs = await redis_client.lrange(LOG_HISTORY_KEY, 0, limit - 1)
        logs = [json.loads(log) for log in raw_logs]
        logs.reverse()  # Oldest first
        return logs
    except Exception:
        return []
