import asyncio
import httpx
import logging
import json
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from openai import OpenAI

from app.core.config import get_settings
from app.models.job import JobCreate
from app.models.custom_source import CustomJobSource

settings = get_settings()
logger = logging.getLogger("CustomScraper")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

CUSTOM_SCRAPE_PROMPT = """
You are a precision AI data extractor. I will provide you with the raw text from a custom job board webpage. 
Your ONLY task is to identify and extract ALL the job listings present in the text. 
For every job you find, extract its Title, Company (if available, otherwise leave empty), Location, and the URL to apply or view it.

Return the result as a STRICT JSON object containing a single key "jobs", which is an array of objects. Do NOT include markdown code blocks.

The schema MUST BE EXACTLY:
{
  "jobs": [
    {
      "title": "string",
      "company": "string",
      "location": "string",
      "url": "string"
    }
  ]
}

Ensure the URL is an absolute URL if possible.
"""

def extract_jobs_with_deepseek(text: str, source_url: str) -> list[dict]:
    if not settings.DEEPSEEK_API_KEY:
        logger.error("No DEEPSEEK_API_KEY found")
        return []

    client = OpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
    )

    prompt = f"Here is the text from the webpage ({source_url}):\n\n{text[:25000]}" # limit to 25k chars to avoid token limit

    try:
        response = client.chat.completions.create(
            model="deepseek-chat", # use fast model
            messages=[
                {"role": "system", "content": CUSTOM_SCRAPE_PROMPT},
                {"role": "user", "content": prompt},
            ],
            stream=False,
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content or "{\"jobs\": []}"
        logger.info(f"DeepSeek parsed content: {content[:500]}...")
        
        # Strip potential markdown fences just in case
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        result = json.loads(content)
        if isinstance(result, dict) and "jobs" in result:
            return result["jobs"]
        return []
    except Exception as e:
        logger.error(f"DeepSeek extraction failed for {source_url}: {e}")
        return []

async def fetch_custom_jobs(source: CustomJobSource, supabase) -> dict:
    logger.info(f"Fetching custom job source: {source.name} from {source.url}")

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(
                str(source.url),
                headers=HEADERS,
                timeout=30.0,
            )
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch {source.url}: HTTP {response.status_code}")
                return {"jobs": [], "retries": 0, "failed": True, "recent_jobs": [], "source_config": source}
                
            soup = BeautifulSoup(response.text, "html.parser")
            for script in soup(["script", "style", "noscript", "svg"]):
                script.extract()
            text = soup.get_text(separator=" ", strip=True)
            logger.info(f"Extracted HTML text len: {len(text)}. Snippet: {text[:200]}")
            
            raw_jobs = await asyncio.to_thread(
                extract_jobs_with_deepseek, text, str(source.url)
            )
            
            parsed_jobs = []
            
            from urllib.parse import urljoin
            
            for index, rj in enumerate(raw_jobs):
                title = rj.get("title")
                if not title:
                    continue
                    
                job_url = rj.get("url") or str(source.url)
                # Ensure job_url is absolute
                job_url = urljoin(str(source.url), job_url)
                
                # We want a very stable hash. DeepSeek might slightly alter title/company casing or add URL params.
                # Let's normalize by stripping and uppercasing to unify them as best as possible.
                import hashlib
                normalized_title = title.strip().upper()
                normalized_company = rj.get('company', '').strip().upper()
                unique_str = f"{normalized_title}-{normalized_company}"
                ext_id = hashlib.md5(unique_str.encode()).hexdigest()
                
                job_create = JobCreate(
                    title=title,
                    company=rj.get("company") or source.name,
                    location=rj.get("location") or "Unknown",
                    url=job_url,
                    source=source.name, # Use custom tab name as source
                    external_id=ext_id,
                    posted_at=datetime.now(timezone.utc),
                )
                parsed_jobs.append(job_create)
                
            logger.info(f"Custom Scraper ({source.name}): Extracted {len(parsed_jobs)} jobs")
            
            # For custom scraper, all extracted jobs are treated as new/recent
            return {
                "jobs": parsed_jobs,
                "retries": 0,
                "failed": False,
                "recent_jobs": parsed_jobs,
                "source_config": source, # Pass config back to access TTL later
            }
            
    except Exception as e:
        logger.error(f"Scraping failed for custom source {source.name}: {e}")
        return {"jobs": [], "retries": 0, "failed": True, "recent_jobs": [], "source_config": source}
