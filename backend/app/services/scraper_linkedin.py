import httpx
import logging
import asyncio
import json
from typing import List, Optional
from app.core.config import get_settings
from app.models.job import JobCreate

settings = get_settings()
logger = logging.getLogger("VelocityScraper")

# The internal API endpoint used by LinkedIn's web app
LINKEDIN_API_URL = "https://www.linkedin.com/voyager/api/search/hits"

async def fetch_linkedin_jobs(keywords: str = "Software Engineer") -> List[JobCreate]:
    """
    Hits the LinkedIn Voyager API directly.
    Bypasses HTML rendering for maximum speed.
    """
    
    # We need to look like a real browser session
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Csrf-Token": settings.LINKEDIN_JSESSIONID.strip('"'), # Often needed for Voyager
        "X-RestLi-Protocol-Version": "2.0.0",
        "Accept": "application/vnd.linkedin.normalized+json+2.1",
        "Referer": "https://www.linkedin.com/jobs/search/",
    }

    cookies = {
        "li_at": settings.LINKEDIN_LI_AT,
        "JSESSIONID": settings.LINKEDIN_JSESSIONID
    }

    # Query parameters reverse-engineered from the Network tab
    params = {
        "keywords": keywords,
        "origin": "JOB_SEARCH_PAGE_SEARCH_BOX",
        "q": "jserpAll",
        # "filters": "List(sortBy->DD,resultType->JOBS)", # DD = Date Descending (Newest)
        # Note: The filters syntax can be tricky and changes often. 
        # If this fails, remove the 'filters' param to just get relevance sort.
        "start": 0,
        "count": 10 
    }

    found_jobs = []

    async with httpx.AsyncClient(proxy=settings.PROXY_URL if settings.PROXY_URL else None) as client:
        try:
            logger.info(f"Pinging LinkedIn Voyager for: {keywords}")
            
            response = await client.get(
                LINKEDIN_API_URL,
                params=params,
                headers=headers,
                cookies=cookies,
                timeout=10.0
            )

            if response.status_code == 429:
                logger.warning("LinkedIn is rate limiting us. Backing off.")
                return []
            
            if response.status_code != 200:
                logger.error(f"LinkedIn API Error: {response.status_code} - {response.text[:200]}")
                return []

            data = response.json()
            
            # Parsing the Voyager JSON is a bit of a nightmare, it's very nested.
            # We look for 'included' elements which contain the Job Posting data.
            elements = data.get("included", [])
            
            for element in elements:
                # We identify job postings by checking for specific fields
                if "title" in element and "entityUrn" in element and "urn:li:fs_normalized_jobPosting" in element["$type"]:
                    
                    # Extracting the messy details
                    job_id = element["entityUrn"].split(":")[-1]
                    title = element.get("title", "Unknown Role")
                    
                    # Company name is often linked in a separate 'included' object
                    # For speed/hackiness, we might just grab the text if available, 
                    # or set a placeholder if the resolution is too complex for a single pass.
                    company_name = "Unknown Company" 
                    # (To get real company name, we'd need to map the 'companyDetails' URN to the other objects in 'included')
                    
                    # Construct the direct URL
                    apply_url = f"https://www.linkedin.com/jobs/view/{job_id}/"
                    
                    job = JobCreate(
                        title=title,
                        company=company_name, # We can refine this mapping if you want
                        location="See Job Post", # Location is also nested deep
                        url=apply_url,
                        source="LinkedIn",
                        external_id=job_id,
                        is_new=True
                    )
                    found_jobs.append(job)

            logger.info(f"Extracted {len(found_jobs)} jobs from raw JSON.")
            return found_jobs

        except Exception as e:
            logger.error(f"Scraper crashed: {e}")
            return []