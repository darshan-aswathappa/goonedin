import json
import logging

logger = logging.getLogger("RedisConfig")

CONFIG_KEYS = {
    "target_keywords": "config:target_keywords",
    "target_locations": "config:target_locations",
    "blocked_companies": "config:blocked_companies",
    "title_filter_keywords": "config:title_filter_keywords",
}

DEFAULT_TARGET_KEYWORDS = [
    "Software Engineer",
    "Software Developer",
    "Backend",
    "Full Stack",
    "FullStack",
    "Java",
    "Python",
    "New Grad",
    "Entry Level Software Engineer",
    "Associate Software Engineer",
    "Junior Software Developer",
    "Junior Software Engineer",
    "SWE",
    "Entry Level Software Developer",
]

DEFAULT_TARGET_LOCATIONS = ["United States"]

DEFAULT_BLOCKED_COMPANIES = [
    "Infosys",
    "Wipro",
    "TCS",
    "Wiraa",
    "BeaconFire Inc.",
    "FetchJobs.co",
    "Cognizant",
    "HCL",
    "Tech Mahindra",
    "LTI",
    "Mphasis",
    "Capgemini",
    "Accenture",
    "DXC Technology",
    "NTT Data",
    "Mindtree",
    "Virtusa",
    "Hexaware Technologies",
    "Zensurance",
    "Bespoke Technologies, Inc.",
    "Trinity Technology Solutions LLC",
    "The Swift Group, LLC",
    "Nesco Resource",
    "Egotechworld",
    "Jobs via Dice",
    "Lensa",
    "Best Job Tool",
    "Robert Half",
    "Hirenza",
    "UHS Physician Careers",
    "Tekskills Inc.",
    "Randstad Digital Americas",
    "CEO Foundry LLC",
    "TRANSREACH TALENT LLC",
    "Underdog.io -Apply to top tech jobs in 60 seconds. A place where companies apply to you",
    "TalentAlly",
    "WayUp",
    "RemoteHunter",
]

DEFAULT_TITLE_FILTER_KEYWORDS = [
    "senior",
    "principal",
    "manager",
    "staff",
    "sr.",
    "lead",
    "director",
    "nurse",
    "therapist",
    "Veterinarian",
]


async def get_config_list(redis_client, key: str, default: list) -> list:
    """Get a list config from Redis, returning default if not found."""
    try:
        redis_key = CONFIG_KEYS.get(key)
        if not redis_key:
            return default
        value = await redis_client.get(redis_key)
        if value:
            return json.loads(value)
        return default
    except Exception as e:
        logger.warning(f"Failed to get config '{key}' from Redis: {e}")
        return default


async def set_config_list(redis_client, key: str, value: list) -> bool:
    """Set a list config in Redis."""
    try:
        redis_key = CONFIG_KEYS.get(key)
        if not redis_key:
            return False
        await redis_client.set(redis_key, json.dumps(value))
        logger.info(f"Updated config '{key}' with {len(value)} items")
        return True
    except Exception as e:
        logger.error(f"Failed to set config '{key}' in Redis: {e}")
        return False


async def get_target_keywords(redis_client) -> list[str]:
    """Get target keywords from Redis."""
    return await get_config_list(redis_client, "target_keywords", DEFAULT_TARGET_KEYWORDS)


async def get_target_locations(redis_client) -> list[str]:
    """Get target locations from Redis."""
    return await get_config_list(redis_client, "target_locations", DEFAULT_TARGET_LOCATIONS)


async def get_blocked_companies(redis_client) -> list[str]:
    """Get blocked companies from Redis."""
    return await get_config_list(redis_client, "blocked_companies", DEFAULT_BLOCKED_COMPANIES)


async def get_title_filter_keywords(redis_client) -> list[str]:
    """Get title filter keywords from Redis."""
    return await get_config_list(redis_client, "title_filter_keywords", DEFAULT_TITLE_FILTER_KEYWORDS)


async def seed_config_if_missing(redis_client) -> None:
    """Seed default config values in Redis if they don't exist."""
    try:
        for key, redis_key in CONFIG_KEYS.items():
            exists = await redis_client.exists(redis_key)
            if not exists:
                default = {
                    "target_keywords": DEFAULT_TARGET_KEYWORDS,
                    "target_locations": DEFAULT_TARGET_LOCATIONS,
                    "blocked_companies": DEFAULT_BLOCKED_COMPANIES,
                    "title_filter_keywords": DEFAULT_TITLE_FILTER_KEYWORDS,
                }.get(key, [])
                await redis_client.set(redis_key, json.dumps(default))
                logger.info(f"Seeded config '{key}' with {len(default)} default values")
            else:
                logger.info(f"Config '{key}' already exists in Redis")
    except Exception as e:
        logger.error(f"Failed to seed config in Redis: {e}")


async def get_all_config(redis_client) -> dict:
    """Get all config values from Redis."""
    return {
        "target_keywords": await get_target_keywords(redis_client),
        "target_locations": await get_target_locations(redis_client),
        "blocked_companies": await get_blocked_companies(redis_client),
        "title_filter_keywords": await get_title_filter_keywords(redis_client),
    }
