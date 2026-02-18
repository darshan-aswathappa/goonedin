import httpx
import logging
import urllib.parse
from bs4 import BeautifulSoup
from app.core.config import get_settings
# We are using the JobCreate model now, just like you wanted
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

async def fetch_linkedin_jobs(keywords: str = None):
    """
    Hits the public LinkedIn guest API to find jobs.
    Parses the HTML response into real JobCreate objects.
    """
    # Use the keywords you give me, or fall back to the settings
    search_term = keywords or (settings.JOB_TITLE_WATCHLIST[0] if settings.JOB_TITLE_WATCHLIST else "Software Engineer")
    
    encoded_keywords = urllib.parse.quote(search_term)
    
    # We are hitting the guest API. It returns HTML <li> elements.
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={encoded_keywords}&start=0"

    logger.info(f"Pinging LinkedIn Guest API for: {search_term}")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=HEADERS, timeout=10.0)
            
            if response.status_code != 200:
                logger.error(f"LinkedIn API Error: {response.status_code}")
                return []

            if response.text:
                logger.info("Successfully retrieved raw job data from LinkedIn! Parsing HTML...")
                
                # Parse the HTML soup
                soup = BeautifulSoup(response.text, "html.parser")
                job_cards = soup.find_all("li")
                
                parsed_jobs = []
                
                for card in job_cards:
                    try:
                        # 1. Extract Title
                        title_tag = card.find("h3", class_="base-search-card__title")
                        title = title_tag.get_text(strip=True) if title_tag else "Unknown Title"

                        # 2. Extract Company
                        company_tag = card.find("h4", class_="base-search-card__subtitle")
                        company = company_tag.get_text(strip=True) if company_tag else "Unknown Company"

                        # 3. Extract Location
                        location_tag = card.find("span", class_="job-search-card__location")
                        location = location_tag.get_text(strip=True) if location_tag else "Unknown Location"

                        # 4. Extract URL & External ID
                        link_tag = card.find("a", class_="base-card__full-link")
                        job_url = link_tag["href"] if link_tag else ""
                        
                        # We need a unique ID. LinkedIn URLs usually look like:
                        # .../view/3762829191/...
                        # So we try to grab that number.
                        external_id = "unknown"
                        if job_url:
                            # Remove query parameters first
                            clean_url = job_url.split("?")[0]
                            # The ID is usually the last part of the path or embedded
                            # Let's try to grab the numeric ID from the URL string
                            import re
                            id_match = re.search(r"-(\d+)\?", job_url) or re.search(r"/(\d+)/?$", clean_url)
                            if id_match:
                                external_id = id_match.group(1)
                            else:
                                # Fallback: use the whole URL as ID if we can't find a number
                                external_id = job_url[-20:] 

                        # 5. Create the JobCreate Object
                        # I'm filling in defaults for fields we don't have yet (like salary)
                        job_obj = JobCreate(
                            title=title,
                            company=company,
                            location=location,
                            url=job_url,
                            source="LinkedIn",
                            external_id=external_id,
                            description=f"Job at {company} in {location}", # Placeholder
                            salary_min=0, # Default
                            salary_max=0, # Default
                            currency="USD" # Default
                        )
                        parsed_jobs.append(job_obj)
                        
                    except Exception as parse_err:
                        # If a single card is malformed, just skip it and keep going
                        logger.warning(f"Failed to parse a job card: {parse_err}")
                        continue

                logger.info(f"Parsed {len(parsed_jobs)} real jobs successfully.")
                return parsed_jobs
            
            return []

        except Exception as e:
            logger.error(f"Scraping failed: {str(e)}")
            return []