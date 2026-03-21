import logging
import asyncio
from datetime import datetime, timezone
from typing import Callable, Awaitable
from collections import deque
from app.core.context_vars import current_user_id

MAX_STORED_LOGS = 500

# In-memory ring buffer shared across all users
_log_buffer: deque[dict] = deque(maxlen=MAX_STORED_LOGS)


class BroadcastLogHandler(logging.Handler):
    """
    Broadcasts log messages via WebSocket and stores them in an in-memory buffer.
    """

    def __init__(self, broadcast_callback: Callable[[dict], Awaitable[None]]):
        super().__init__()
        self.broadcast_callback = broadcast_callback
        self.setFormatter(logging.Formatter("%(message)s"))

    def emit(self, record: logging.LogRecord):
        user_id = current_user_id.get()
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": self.format(record),
            "logger": record.name,
            "user_id": user_id,
        }
        _log_buffer.append(log_entry)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast_callback(user_id, log_entry))
        except RuntimeError:
            pass


def get_historical_logs(limit: int = 500, user_id: str | None = None) -> list:
    """Return recent log entries from the in-memory buffer, oldest first.
    Filters to entries belonging to user_id (or global entries with no user_id).
    """
    logs = list(_log_buffer)
    if user_id is not None:
        logs = [e for e in logs if e.get("user_id") in (user_id, None)]
    return logs[-limit:]
