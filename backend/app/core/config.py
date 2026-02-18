import os
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # --- PROJECT INFO ---
    PROJECT_NAME: str = "Velocity Job Monitor"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # --- SECURITY & SECRETS ---
    # Generate a random string for this: openssl rand -hex 32
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change_this_to_something_nasty_and_long")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # --- TARGETS ---
    # The keywords we are hunting for. Comma separated.
    TARGET_KEYWORDS: list[str] = [
        "Software Engineer", 
        "Python Developer", 
        "Backend Engineer", 
        "DevOps"
    ]
    TARGET_LOCATIONS: list[str] = ["Remote", "United States", "New York"]

    # --- PROXY & NETWORK ---
    # This is critical for the "hacky" speed. We need rotating IPs.
    # Format: http://user:pass@host:port
    PROXY_URL: str = os.getenv("PROXY_URL", "") 
    
    # --- LINKEDIN CREDENTIALS (THE "BURNER" ACCOUNT) ---
    # We need the 'li_at' cookie to hit the private API endpoints
    LINKEDIN_LI_AT: str = os.getenv("LINKEDIN_LI_AT", "")
    LINKEDIN_JSESSIONID: str = os.getenv("LINKEDIN_JSESSIONID", "")

    # --- NOTIFICATIONS ---
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # --- DATABASE (Optional for now, but good for logging seen jobs) ---
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    class Config:
        case_sensitive = True
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()