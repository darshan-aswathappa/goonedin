import logging
import asyncio
from datetime import datetime, timezone
from typing import Callable, Awaitable


class BroadcastLogHandler(logging.Handler):
    """
    Custom log handler that broadcasts log messages via a callback function.
    Used to stream logs to the frontend in real-time.
    """

    def __init__(self, broadcast_callback: Callable[[dict], Awaitable[None]]):
        super().__init__()
        self.broadcast_callback = broadcast_callback
        self.setFormatter(logging.Formatter("%(message)s"))

    def emit(self, record: logging.LogRecord):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": self.format(record),
            "logger": record.name,
        }

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast_callback(log_entry))
        except RuntimeError:
            pass
