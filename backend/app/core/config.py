import os
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # --- PROJECT INFO ---
    PROJECT_NAME: str = "Velocity Job Monitor"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # --- PROXY & NETWORK ---
    # This is critical for the "hacky" speed. We need rotating IPs.
    # Format: http://user:pass@host:port
    PROXY_URL: str = os.getenv("PROXY_URL", "") 
    
    # --- NOTIFICATIONS ---
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # --- DATABASE (Optional for now, but good for logging seen jobs) ---
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # --- JOBRIGHT.AI CREDENTIALS ---
    JOBRIGHT_EMAIL: str = os.getenv("JOBRIGHT_EMAIL", "")
    JOBRIGHT_PASSWORD: str = os.getenv("JOBRIGHT_PASSWORD", "")

    class Config:
        case_sensitive = True
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()