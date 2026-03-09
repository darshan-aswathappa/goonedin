"""Centralized retry utility for Supabase operations with exponential backoff."""

import asyncio
import logging

logger = logging.getLogger("SupabaseRetry")


async def retry_supabase(fn, max_retries: int = 3, base_delay: float = 0.5):
    """
    Retry a synchronous Supabase operation with exponential backoff.

    Args:
        fn: A synchronous callable that performs the Supabase operation
        max_retries: Maximum number of attempts (default 3 = 3 attempts)
        base_delay: Base delay in seconds for exponential backoff (default 0.5s)

    Returns:
        The result of fn() if successful

    Raises:
        Exception: The last exception if all retries fail
    """
    for attempt in range(max_retries):
        try:
            return await asyncio.to_thread(fn)
        except Exception as e:
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)  # 0.5s, 1s, 2s
                logger.warning(
                    f"Supabase attempt {attempt + 1}/{max_retries} failed, "
                    f"retrying in {delay}s: {e}"
                )
                await asyncio.sleep(delay)
            else:
                logger.error(f"Supabase operation failed after {max_retries} attempts: {e}")
                raise
