import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- PROJECT INFO ---
    PROJECT_NAME: str = "Velocity Job Monitor"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # --- PROXY & NETWORK ---
    PROXY_URL: str = os.getenv("PROXY_URL", "")

    # --- SUPABASE ---
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # --- AI / DEEPSEEK ---
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")

    # --- MICROSERVICES ---
    RESUME_SERVICE_URL: str = os.getenv(
        "RESUME_SERVICE_URL", "http://resume-service:8001"
    )

    # --- INDEED ---
    INDEED_API_KEY: str = os.getenv(
        "INDEED_API_KEY",
        "xyz",
    )

    # --- CREDENTIAL ENCRYPTION ---
    # AES-256-GCM key for encrypting third-party credentials stored in the DB.
    # Generate: python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
    CREDENTIAL_ENCRYPTION_KEY: str = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "")

    # --- QUEUE WORKER ---
    ANALYSIS_WORKER_CONCURRENCY: int = int(
        os.getenv("ANALYSIS_WORKER_CONCURRENCY", "3")
    )

    # --- KNOWLEDGE BASE / AI QUERY ---
    # OpenAI key for text-embedding-3-small (DeepSeek does not offer embeddings)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    # Direct Postgres connection string for the AI query layer.
    # PREFERRED: use the Supabase postgres superuser URL — this bypasses RLS so
    # aggregate queries across all users work correctly.  The Python security
    # layer (sql_executor.py) enforces the PII-table restrictions instead.
    #
    # Get it from: Supabase Dashboard → Settings → Database → Connection string
    #   (choose "URI", port 5432 or 6543)
    # Format: postgresql://postgres.PROJECT_REF:DB_PASSWORD@host:5432/postgres
    #
    # FALLBACK (legacy): AI_READONLY_DB_URL — connects as ai_query_user which
    # has the ai_kb_reader role.  Subject to Supabase RLS even with BYPASSRLS
    # set, so aggregate queries return 0 rows unless migration 007 is applied
    # for every table.  Not recommended for new deployments.
    SUPABASE_DB_URL: str = os.getenv("SUPABASE_DB_URL", "")
    AI_READONLY_DB_URL: str = os.getenv("AI_READONLY_DB_URL", "")
    # Max rows the AI SQL layer is allowed to return per query (safety cap)
    KB_SQL_ROW_LIMIT: int = int(os.getenv("KB_SQL_ROW_LIMIT", "500"))
    # TTL in seconds for the in-process embedding cache
    KB_EMBED_CACHE_TTL: int = int(os.getenv("KB_EMBED_CACHE_TTL", "3600"))

    # --- GREENHOUSE INGESTION ---
    # Kill-switch for the global Greenhouse crawler + per-user matcher.
    GREENHOUSE_ENABLED: bool = os.getenv("GREENHOUSE_ENABLED", "true").lower() == "true"
    # Boards fetched per crawl round (shard size). Full sweep = 5148 / this.
    GREENHOUSE_SHARD_SIZE: int = int(os.getenv("GREENHOUSE_SHARD_SIZE", "200"))
    # Max concurrent board fetches within a round.
    GREENHOUSE_CONCURRENCY: int = int(os.getenv("GREENHOUSE_CONCURRENCY", "15"))
    # Only ingest jobs whose first_published is within this many hours.
    # Also guards the first sweep from dumping every historically-open job.
    GREENHOUSE_FRESHNESS_HOURS: int = int(os.getenv("GREENHOUSE_FRESHNESS_HOURS", "48"))
    # Seconds to sleep between crawl rounds (jittered).
    GREENHOUSE_ROUND_DELAY: int = int(os.getenv("GREENHOUSE_ROUND_DELAY", "20"))
    # Consecutive 404/failures before a board is marked dead.
    GREENHOUSE_MAX_FAILURES: int = int(os.getenv("GREENHOUSE_MAX_FAILURES", "3"))
    # Per-user matcher poll interval (seconds).
    GREENHOUSE_MATCH_INTERVAL: int = int(os.getenv("GREENHOUSE_MATCH_INTERVAL", "120"))

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()
