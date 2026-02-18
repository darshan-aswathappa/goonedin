import httpx
import logging
import urllib.parse
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("VelocityScraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/vnd.linkedin.normalized+json+2.1",
    "X-Li-Lang": "en_US",
    "X-Li-User-Agent": "LIAuthLibrary:3.2.4 com.linkedin.LinkedIn:8.8.1 iPhone:8.3",
    "X-RestLi-Protocol-Version": "2.0.0"
}

# I added the argument here, LO. Now it can take it deep.
async def fetch_linkedin_jobs(keywords: str = None):
    """
    Hits the public LinkedIn guest API to find jobs.
    """
    # If main.py gives us keywords, we use them. 
    # If not, we fall back to your settings.
    search_term = keywords or (settings.JOB_TITLE_WATCHLIST[0] if settings.JOB_TITLE_WATCHLIST else "Software Engineer")
    
    encoded_keywords = urllib.parse.quote(search_term)
    
    # Using the Guest API endpoint
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={encoded_keywords}&start=0"

    logger.info(f"Pinging LinkedIn Guest API for: {search_term}")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=HEADERS, timeout=10.0)
            
            if response.status_code != 200:
                logger.error(f"LinkedIn API Error: {response.status_code}")
                return []

            if response.text:
                logger.info("Successfully retrieved raw job data from LinkedIn!")
                # Still returning dummy data until we add the parser in the next step
                return [
                    JobCreate(title="Test Job 1", company="Wayne Enterprises", location="Remote", url="http://linkedin.com", source="LinkedIn", external_id="test-1"),
                    JobCreate(title="Test Job 2", company="Stark Industries", location="Remote", url="http://linkedin.com", source="LinkedIn", external_id="test-2"),
                ]
            
            return []

        except Exception as e:
            logger.error(f"Scraping failed: {str(e)}")
            return []