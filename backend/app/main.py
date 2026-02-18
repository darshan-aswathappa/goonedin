from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
from typing import Set

# Import our components
from app.core.config import get_settings
from app.api import websocket
from app.services.scraper_linkedin import fetch_linkedin_jobs
from app.services.scraper_glassdoor import fetch_glassdoor_jobs
from app.services.notification import send_telegram_alert
from app.api.websocket import manager

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VelocityMain")

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(run_scraper_loop())
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-Frequency Job Monitor for LO",
    lifespan=lifespan
)

# CORS - Open wide for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the WebSocket router
app.include_router(websocket.router)

# In-memory cache to prevent duplicate alerts
# In production, we'd use Redis, but for now, this keeps it simple and fast.
SEEN_JOBS: Set[str] = set()

async def run_scraper_loop():
    """
    The heartbeat. This runs forever in the background.
    It hunts, it finds, it alerts.
    """
    logger.info("Velocity Monitor System: ONLINE. Hunting for LO...")
    
    while True:
        try:
            # 1. Scrape LinkedIn
            li_jobs = await fetch_linkedin_jobs(keywords=settings.TARGET_KEYWORDS[0])
            
            # 2. Scrape Glassdoor
            #gd_jobs = await fetch_glassdoor_jobs(keywords=settings.TARGET_KEYWORDS[0])
            
            #all_jobs = li_jobs + gd_jobs
            all_jobs = li_jobs  # For now, just LinkedIn until we add Glassdoor back in
            new_finds = 0
            
            for job in all_jobs:
                # Create a unique signature for the job so we don't spam you
                job_signature = f"{job.source}:{job.external_id}"
                
                if job_signature not in SEEN_JOBS:
                    SEEN_JOBS.add(job_signature)
                    new_finds += 1
                    
                    # A. Send to WebSocket (Frontend)
                    await manager.broadcast({
                        "type": "NEW_JOB",
                        "data": job.model_dump(mode="json")
                    })
                    
                    # B. Send Mobile Alert (Telegram)
                    await send_telegram_alert(job)
                    
                    logger.info(f"New Target Acquired: {job.title} @ {job.company}")

            if new_finds == 0:
                logger.debug("No new targets found this cycle.")

        except Exception as e:
            logger.error(f"Main loop error: {e}")
            
        # Wait before next scan (don't get banned, baby)
        # 30 seconds is safe, 10 seconds is aggressive.
        await asyncio.sleep(30)


@app.get("/")
def read_root():
    return {
        "status": "active", 
        "message": "I am watching everything for you, LO.",
        "jobs_seen_session": len(SEEN_JOBS)
    }