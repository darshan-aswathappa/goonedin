import httpx
import json
import logging
from bs4 import BeautifulSoup
from typing import List
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("VelocityGlassdoor")

GLASSDOOR_BASE_URL = "https://www.glassdoor.com"

async def fetch_glassdoor_jobs(keywords: str = "Software Engineer", location: str = "Remote") -> List[JobCreate]:
    """
    Rips the JSON data directly out of Glassdoor's server-side rendered HTML.
    Much faster than Selenium.
    """
    
    # We need to look like a real user, or they will block us instantly.
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.glassdoor.com/",
    }

    # Constructing the search URL
    # Note: Glassdoor URL structures change, but this is the standard search path
    search_url = f"{GLASSDOOR_BASE_URL}/Job/jobs.htm"
    params = {
        "sc.keyword": keywords,
        "locT": "N",  # National?
        "locId": "0", # 0 usually means everywhere/remote if combined with keyword
        "jobType": "all",
        "fromAge": "1", # Last 1 day (fresh meat only)
    }

    found_jobs = []

    async with httpx.AsyncClient(proxy=settings.PROXY_URL if settings.PROXY_URL else None) as client:
        try:
            logger.info(f"Stalking Glassdoor for: {keywords}")
            
            response = await client.get(
                search_url, 
                params=params, 
                headers=headers, 
                timeout=10.0,
                follow_redirects=True
            )

            if response.status_code != 200:
                logger.error(f"Glassdoor blocked us: {response.status_code}")
                return []

            # Parse the HTML
            soup = BeautifulSoup(response.text, "html.parser")
            
            # The Holy Grail: The Next.js data blob
            script_tag = soup.find("script", {"id": "__NEXT_DATA__"})
            
            if not script_tag:
                logger.warning("Could not find the hidden JSON blob on Glassdoor.")
                return []

            data = json.loads(script_tag.string)
            
            # Navigating the JSON hellscape to find the job list
            # This path is fragile and might need updates if they change their frontend structure
            try:
                job_listings = data["props"]["pageProps"]["apolloCache"]
                
                # We iterate through the cache to find Job objects
                for key, item in job_listings.items():
                    if key.startswith("Job:") and "jobTitle" in item:
                        
                        # Extract details
                        title = item.get("jobTitle", "Unknown")
                        company = item.get("employer", {}).get("name", "Unknown Company")
                        job_id = item.get("jobId", "")
                        
                        # Construct URL
                        # Glassdoor URLs are weird, usually need the ID
                        url = f"https://www.glassdoor.com/job-listing/j?jl={job_id}"
                        
                        job = JobCreate(
                            title=title,
                            company=company,
                            location=item.get("location", {}).get("name", "Remote"),
                            url=url,
                            source="Glassdoor",
                            external_id=str(job_id),
                            is_new=True
                        )
                        found_jobs.append(job)
                        
            except KeyError as e:
                logger.error(f"JSON structure changed: {e}")

            logger.info(f"Extracted {len(found_jobs)} jobs from Glassdoor.")
            return found_jobs

        except Exception as e:
            logger.error(f"Glassdoor scraper crashed: {e}")
            return []