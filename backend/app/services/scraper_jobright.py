import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any
from curl_cffi.requests import AsyncSession
from app.core.config import get_settings
from app.models.job import JobCreate

logger = logging.getLogger("VelocityScraper.Jobright")
settings = get_settings()

BASE_URL = "https://jobright.ai"

async def login_jobright() -> AsyncSession | None:
    """
    Initialize a Jobright.ai session.
    Prioritizes injecting the SESSION_ID cookie extracted from the browser.
    """
    session_cookie = settings.JOBRIGHT_COOKIE
    
    # Configure proxies if provided in environment
    proxies = {}
    if settings.PROXY_URL:
        # curl_cffi requires the scheme of the proxy mapped properly
        if settings.PROXY_URL.startswith("http://"):
            proxies["http"] = settings.PROXY_URL
            proxies["https"] = settings.PROXY_URL # Map HTTPS traffic to HTTP proxy port
        elif settings.PROXY_URL.startswith("https://"):
            proxies["https"] = settings.PROXY_URL
            proxies["http"] = settings.PROXY_URL
        else:
            proxies["http"] = settings.PROXY_URL
            proxies["https"] = settings.PROXY_URL
            
    session_kwargs = {
        "impersonate": "chrome110",
        "verify": False # Required to prevent OpenSSL TLS 'invalid library' errors on HTTP proxies
    }
    
    if proxies:
        logger.info(f"Using proxy configuration: {settings.PROXY_URL.split('@')[-1] if '@' in settings.PROXY_URL else 'configured'}")
        session_kwargs["proxies"] = proxies
        
    session = AsyncSession(**session_kwargs)
    
    if session_cookie:
        logger.info("Injecting SESSION_ID cookie for Jobright authentication.")
        session.cookies.set("SESSION_ID", session_cookie, domain=".jobright.ai")
        return session
    else:
        logger.error("Jobright SESSION_ID cookie not found in env.")
        return None

async def fetch_jobright_jobs(keywords: str = "", location: str = "", limit: int = 20, max_age_hours: float | None = 2.0) -> Dict[str, Any]:
    """
    Scrape jobs from Jobright.ai by hitting the personalized 'recommend/list/jobs' API.
    Returns dict matching standardized scraper output format.
    Ignores keywords for now since these endpoints are pure personalized recommendation feeds.
    """
    session = await login_jobright()
    if not session:
        return {"jobs": [], "retries": 0, "failed": True}

    # Endpoint 1: Recommended Jobs (sortCondition=0)
    # Endpoint 2: Top Matched Jobs (sortCondition=2)
    urls = [
        f"{BASE_URL}/swan/recommend/list/jobs?refresh=true&sortCondition=0&position=0&count={limit}&syncRerank=false",
        f"{BASE_URL}/swan/recommend/list/jobs?refresh=true&sortCondition=2&position=0&count={limit}&syncRerank=false"
    ]

    parsed_jobs = []
    
    for search_url in urls:
        try:
            logger.info(f"Fetching Jobright personalized jobs from: {search_url}")
            res = await session.get(search_url, timeout=15)
            
            if res.status_code != 200:
                logger.warning(f"Jobright search API returned {res.status_code}: {res.text[:200]}")
                continue
            
            try:
                data = res.json()
            except ValueError:
                logger.warning("Jobright returned non-JSON response.")
                continue
            
            # The Swan API wraps results in data.result.jobList
            result_obj = data.get("result", {})
            raw_jobs = result_obj.get("jobList", [])
                
            for j_wrapped in raw_jobs:
                j = j_wrapped.get("jobResult", {}) if "jobResult" in j_wrapped else j_wrapped
                
                title = j.get("jobTitle") or j.get("jobNlpTitle") or "Unknown Title"
                
                # Company data lives outside the immediate job metadata in 'companyResult' wrapper
                c_wrapped = j_wrapped.get("companyResult", {})
                company = c_wrapped.get("companyName") or "Unknown Company"
                
                loc = j.get("jobLocation") or location
                
                # Fetch min and max salary properties and assemble into a string
                salary = None
                salary_desc = j.get("salaryDesc")
                if salary_desc:
                    salary = salary_desc
                else:
                    min_sal = j.get("minSalary")
                    max_sal = j.get("maxSalary")
                    if min_sal and max_sal:
                        # Jobright stores as raw integers like 140000.0
                        salary = f"${int(min_sal):,} - ${int(max_sal):,}"
                    elif min_sal:
                        salary = f"${int(min_sal):,}"
                
                # Visa explicitly exists under "isH1bSponsor"
                visa = None
                if j.get("isH1bSponsor") is True:
                    visa = "H1B Sponsor Likely"
                
                # Try to extract the direct application URL or the Jobright internal routing URL
                job_url = j.get("originalUrl") or f"{BASE_URL}/jobs/{j.get('jobId', 'unknown')}"
                external_id = str(j.get("jobId")) if j.get("jobId") else str(hash(title + company))
                
                # Check for duplicates across the two lists
                if any(existing.external_id == external_id for existing in parsed_jobs):
                    continue
                
                posted_at = None
                raw_date = j.get("publishTime")
                if raw_date:
                    try:
                        # Sometimes comes as "2025-10-01 00:00:00", replace space with T for ISO parse
                        iso_str = raw_date.replace(" ", "T").replace("Z", "+00:00")
                        
                        # Add UTC offset if missing
                        if "+" not in iso_str and "-" not in iso_str.split("T")[1]:
                            iso_str += "+00:00"
                            
                        posted_at = datetime.fromisoformat(iso_str)
                    except (ValueError, IndexError):
                        posted_at = datetime.now(timezone.utc)
                else:
                    posted_at = datetime.now(timezone.utc)

                # Skip jobs older than max_age_hours
                if isinstance(max_age_hours, (float, int)):
                    limit_val = float(max_age_hours)
                    age_hours = (datetime.now(timezone.utc) - posted_at).total_seconds() / 3600.0
                    if age_hours > limit_val:
                        continue

                parsed_jobs.append(JobCreate(
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    source="Jobright",
                    external_id=external_id,
                    posted_at=posted_at,
                    salary=salary,
                    visa=visa
                ))
        
        except Exception as e:
            logger.error(f"Jobright scraping error for URL {search_url}: {e}")
            
    logger.info(f"Jobright successfully returned {len(parsed_jobs)} unique jobs total.")
    return {"jobs": parsed_jobs, "retries": 0, "failed": False}
        
