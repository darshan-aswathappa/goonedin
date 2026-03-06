import os
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # --- PROJECT INFO ---
    PROJECT_NAME: str = "Velocity Job Monitor"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # --- PROXY & NETWORK ---
    PROXY_URL: str = os.getenv("PROXY_URL", "")

    # --- DATABASE (REDIS) ---
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # --- SUPABASE ---
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # --- JOBRIGHT.AI CREDENTIALS ---
    JOBRIGHT_EMAIL: str = os.getenv("JOBRIGHT_EMAIL", "")
    JOBRIGHT_PASSWORD: str = os.getenv("JOBRIGHT_PASSWORD", "")

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()