"""
Async-safe context variables for request/task scoping.

ContextVar values propagate through `await` chains and are isolated per
asyncio Task, so setting current_user_id at the start of a scraper loop
iteration scopes all log records emitted within that iteration to the
correct user without modifying every logger call site.
"""
from contextvars import ContextVar

# Set at the top of each per-user scraper loop iteration.
# BroadcastLogHandler reads this to route log entries to the right user.
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)
