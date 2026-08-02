"""
One-time (re-runnable) loader for the Greenhouse board registry.

Reads backend/data/greenhouse.json and upserts every entry into the
greenhouse_boards table. Safe to re-run: crawl cursors (last_crawled_at,
consecutive_failures) are owned by the crawler and preserved across re-seeds.

Usage:
    cd backend
    python -m scripts.seed_greenhouse_boards            # default data/greenhouse.json
    python -m scripts.seed_greenhouse_boards /path/to/greenhouse.json
"""

import asyncio
import json
import sys
from pathlib import Path

from supabase import create_client

from app.core.config import get_settings
from app.services.greenhouse_boards import seed_boards

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "greenhouse.json"


async def main(path: Path) -> None:
    if not path.exists():
        sys.exit(f"greenhouse.json not found at {path}. Drop the file there or pass a path.")

    with path.open() as f:
        boards = json.load(f)

    if not isinstance(boards, list):
        sys.exit("greenhouse.json must be a JSON array of board objects.")

    live = sum(1 for b in boards if b.get("status") == "live")
    print(f"Loaded {len(boards)} boards from {path} ({live} live).")

    settings = get_settings()
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    sent = await seed_boards(supabase, boards)
    print(f"Upserted {sent} boards into greenhouse_boards.")


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    asyncio.run(main(target))
