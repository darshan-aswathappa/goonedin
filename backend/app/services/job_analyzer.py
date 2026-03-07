"""
Job description analysis service using DeepSeek AI.

Fetches full job descriptions from LinkedIn's job posting API,
extracts them from the HTML, and uses DeepSeek to classify keywords
as MUST HAVE or GOOD TO HAVE, plus minimum qualifications.
"""

import json
import re
import logging
from typing import Any, Optional

import httpx
from bs4 import BeautifulSoup
from openai import OpenAI

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("VelocityMain")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

JOB_ANALYSIS_PROMPT = """You are an expert job posting analyzer. Given a job description, extract and classify the relevant keywords, qualifications, salary, and visa sponsorship details. Return valid JSON only (no markdown, no explanation):

{
  "must_have_keywords": ["keyword1", "keyword2", ...],
  "good_to_have_keywords": ["keyword1", "keyword2", ...],
  "minimum_qualifications": ["qualification1", "qualification2", ...],
  "summary": "A 1-2 sentence summary of what the role is about.",
  "compensation": "string | null",
  "visa_status": "string | null"
}

Rules:
- "must_have_keywords" should include skills, technologies, frameworks, languages, and domain expertise that are explicitly REQUIRED or stated as mandatory in the job description. Look for phrases like "required", "must have", "minimum", "essential", "X+ years of experience with".
- "good_to_have_keywords" should include skills and technologies that are PREFERRED, DESIRED, or listed as a plus. Look for phrases like "preferred", "nice to have", "bonus", "ideally", "plus", "familiarity with".
- "minimum_qualifications" should include degree requirements, years of experience, certifications, clearances, or any hard prerequisites.
- "summary" should be a concise description of the role in 1-2 sentences.
- "compensation" should contain the Salary/Compensation details (exact numbers or ranges). If absent, set to null.
- "visa_status" should contain Visa status/Sponsorship rules (e.g. "Does not sponsor H1B", "No OPT/CPT", "Open to Visa sponsorship"). If absent, set to null.
- If a section has no data, return an empty list [] or null as appropriate.
- Return ONLY the JSON object, nothing else."""


FAST_ANALYSIS_PROMPT = """
You are a fast, precise AI job description parser. Your ONLY job is to extract two pieces of information:
1. Salary/Compensation details (exact numbers or ranges).
2. Visa status/Sponsorship rules (e.g. "Does not sponsor H1B", "No OPT/CPT", "Open to Visa sponsorship").

If either is absent in the text, return null for that field. Do NOT guess or infer. Only extract IF explicitly mentioned.

Return ONLY a valid JSON object matching this schema exactly (no markdown formatting, no code blocks):
{
  "compensation": string | null,
  "visa_status": string | null
}
"""

def extract_job_id_from_url(url: str) -> Optional[str]:
    """
    Extract the numeric LinkedIn job ID from a job URL.

    Examples:
        https://www.linkedin.com/jobs/view/software-engineer-qa-at-unity-4380857073/
        -> '4380857073'
    """
    # Try splitting by '-' and taking the last segment (strip trailing slash)
    clean_url = url.rstrip("/")
    parts = clean_url.split("-")
    if parts:
        # Remove any remaining path segments from the last part
        last_part = parts[-1].split("/")[0].split("?")[0]
        if last_part.isdigit():
            return last_part

    # Fallback: regex for numeric ID at end of URL
    match = re.search(r"-(\d+)/?$", url) or re.search(r"/(\d+)/?$", url)
    if match:
        return match.group(1)

    return None


async def fetch_job_description(job_id: str) -> Optional[str]:
    """
    Fetch the full job description HTML from LinkedIn's job posting API
    and extract the description text.
    """
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
    proxy = settings.PROXY_URL if settings.PROXY_URL else None

    async with httpx.AsyncClient(follow_redirects=True, proxy=proxy) as client:
        try:
            response = await client.get(url, headers=HEADERS, timeout=15.0)

            if response.status_code != 200:
                logger.warning(
                    f"[JobAnalyzer] Failed to fetch job {job_id}: HTTP {response.status_code}"
                )
                return None

            if not response.text:
                return None

            soup = BeautifulSoup(response.text, "html.parser")

            # Extract job description using: [class*=description] > section > div
            desc_container = soup.select_one("[class*=description] > section > div")
            if desc_container:
                return desc_container.get_text(separator="\n", strip=True)

            # Fallback: try broader selectors
            desc_div = soup.select_one(".description__text")
            if desc_div:
                return desc_div.get_text(separator="\n", strip=True)

            # Last fallback: any description-class element
            for el in soup.find_all(attrs={"class": re.compile("description")}):
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 100:  # must be substantial
                    return text

            logger.warning(f"[JobAnalyzer] Could not find description in HTML for job {job_id}")
            return None

        except Exception as e:
            logger.error(f"[JobAnalyzer] Error fetching job description for {job_id}: {e}")
            return None


def analyze_job_with_deepseek(description: str, api_key: str) -> dict[str, Any]:
    """
    Call the DeepSeek API to analyze a job description and return classified keywords.
    """
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
    )

    response = client.chat.completions.create(
        model="deepseek-reasoner",
        messages=[
            {"role": "system", "content": JOB_ANALYSIS_PROMPT},
            {"role": "user", "content": f"Analyze this job description:\n\n{description}"},
        ],
        max_tokens=4096,
    )

    content = response.choices[0].message.content or ""

    # Strip potential markdown fences
    content = content.strip()
    if content.startswith("```"):
        first_newline = content.index("\n")
        content = content[first_newline + 1:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        logger.warning(f"[JobAnalyzer] DeepSeek returned non-JSON. Raw: {content[:500]}")
        result = {
            "must_have_keywords": [],
            "good_to_have_keywords": [],
            "minimum_qualifications": [],
            "summary": "Analysis could not be parsed.",
            "compensation": None,
            "visa_status": None,
            "_raw": content,
        }

    return result


async def run_job_analysis(
    external_id: str,
    job_url: str,
    redis_client: Any,
    api_key: str,
) -> Optional[dict[str, Any]]:
    """
    Full analysis pipeline for a single job:
    1. Extract job ID from URL
    2. Fetch job description from LinkedIn API
    3. Analyze with DeepSeek
    4. Store result in Redis
    Returns the analysis dict, or None on failure.
    """
    import asyncio

    try:
        logger.info(f"[JobAnalyzer] Starting analysis for job {external_id}")

        job_id = external_id
        if not job_id:
            logger.warning(f"[JobAnalyzer] No job ID provided: {job_url}")
            return None

        # 2. Fetch job description
        description = await fetch_job_description(job_id)
        if not description:
            logger.warning(f"[JobAnalyzer] No description found for job {job_id}")
            return None

        logger.info(
            f"[JobAnalyzer] Fetched {len(description)} chars of description for job {external_id}"
        )

        # 3. Analyze with DeepSeek (blocking HTTP, run in thread)
        analysis = await asyncio.to_thread(
            analyze_job_with_deepseek, description, api_key
        )

        logger.info(f"[JobAnalyzer] DeepSeek analysis complete for job {external_id}")

        # 4. Store in Redis
        analysis_key = f"job_analysis:{external_id}"
        await redis_client.set(analysis_key, json.dumps(analysis))

        # Also set the same TTL as the job itself if it has one
        job_key = f"seen_job:LinkedIn:{external_id}"
        job_ttl = await redis_client.ttl(job_key)
        if job_ttl > 0:
            await redis_client.expire(analysis_key, job_ttl)

        logger.info(f"[JobAnalyzer] Analysis stored for job {external_id}")
        return analysis

    except Exception as e:
        logger.error(f"[JobAnalyzer] Analysis failed for job {external_id}: {e}")
        return None

async def run_fast_salary_visa_analysis(
    external_id: str,
    job_url: str,
    api_key: str,
) -> dict | None:
    """
    Fast extraction pipeline that only grabs compensation & visa info.
    We don't cache this separately because it gets merged directly into the `Job` object in Redis.
    """
    logger.info(f"[JobAnalyzer] Starting fast salary/visa analysis for job {external_id}")

    job_id = external_id
    if not job_id:
        logger.warning(f"[JobAnalyzer] No job ID provided for fast analysis: {job_url}")
        return None

    description = await fetch_job_description(job_id)
    if not description:
        logger.warning(f"[JobAnalyzer] No description found for fast analysis of {external_id}")
        return None

    # Retry loop for deepseek extraction
    max_retries = 3
    for attempt in range(max_retries):
        try:
            import asyncio
            result_str = await asyncio.to_thread(
                _call_deepseek_fast,
                description,
                api_key
            )
            
            cleaned_str = result_str.strip()
            if cleaned_str.startswith("```json"):
                cleaned_str = cleaned_str[7:]
            if cleaned_str.startswith("```"):
                cleaned_str = cleaned_str[3:]
            if cleaned_str.endswith("```"):
                cleaned_str = cleaned_str[:-3]
            
            fast_data = json.loads(cleaned_str.strip())
            return fast_data
            
        except json.JSONDecodeError as e:
            logger.warning(f"[JobAnalyzer] Fast JSON decode error on attempt {attempt + 1}: {e}. Output was: {result_str}")
        except Exception as e:
            logger.error(f"[JobAnalyzer] Error during fast DeepSeek API call on attempt {attempt + 1}: {e}")
            
    logger.error(f"[JobAnalyzer] Failed to get fast analysis for {external_id} despite retries.")
    return None

def _call_deepseek_fast(description: str, api_key: str) -> str:
    """Synchronous function to make the DeepSeek API call for fast analysis."""
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com"
    )

    response = client.chat.completions.create(
        model="deepseek-chat", # use normal chat here for speed
        messages=[
            {"role": "system", "content": FAST_ANALYSIS_PROMPT},
            {"role": "user", "content": f"Here is the job description:\n\n{description}"}
        ],
        stream=False,
        temperature=0.0
    )
    
    return response.choices[0].message.content or "{}"
