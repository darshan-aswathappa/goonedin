import os
from pydantic_settings import BaseSettings
from functools import lru_cache

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

    # --- JOBRIGHT ---
    JOBRIGHT_EMAIL: str = os.getenv("JOBRIGHT_EMAIL", "")
    JOBRIGHT_PASSWORD: str = os.getenv("JOBRIGHT_PASSWORD", "")
    JOBRIGHT_COOKIE: str = os.getenv("JOBRIGHT_COOKIE", "")

    # --- AI / DEEPSEEK ---
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")

    # --- MICROSERVICES ---
    RESUME_SERVICE_URL: str = os.getenv("RESUME_SERVICE_URL", "http://resume-service:8001")

    # --- QUEUE WORKER ---
    ANALYSIS_WORKER_CONCURRENCY: int = int(os.getenv("ANALYSIS_WORKER_CONCURRENCY", "3"))

    # --- KNOWLEDGE BASE / AI QUERY ---
    # OpenAI key for text-embedding-3-small (DeepSeek does not offer embeddings)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    # asyncpg DSN for the read-only Postgres role used by the AI query layer.
    # Format: postgresql+asyncpg://role:password@host:port/dbname
    AI_READONLY_DB_URL: str = os.getenv("AI_READONLY_DB_URL", "")
    # Max rows the AI SQL layer is allowed to return per query (safety cap)
    KB_SQL_ROW_LIMIT: int = int(os.getenv("KB_SQL_ROW_LIMIT", "500"))
    # TTL in seconds for the in-process embedding cache
    KB_EMBED_CACHE_TTL: int = int(os.getenv("KB_EMBED_CACHE_TTL", "3600"))

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()