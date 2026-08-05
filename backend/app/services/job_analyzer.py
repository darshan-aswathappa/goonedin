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
  "min_experience_years": 0,
  "summary": "A 1-2 sentence summary of what the role is about.",
  "compensation": "string | null",
  "visa_status": "string | null"
}

Rules:
- "must_have_keywords" should include skills, technologies, frameworks, languages, and domain expertise that are explicitly REQUIRED or stated as mandatory in the job description. Look for phrases like "required", "must have", "minimum", "essential", "X+ years of experience with".
- "good_to_have_keywords" should include skills and technologies that are PREFERRED, DESIRED, or listed as a plus. Look for phrases like "preferred", "nice to have", "bonus", "ideally", "plus", "familiarity with".
- "minimum_qualifications" should include degree requirements, years of experience, certifications, clearances, or any hard prerequisites.
- "min_experience_years" MUST be an integer (>= 0, never null) for the minimum total years of professional work experience REQUIRED to be eligible for the role. Apply these rules exactly, in order:
    * Consider ONLY hard requirements. Look for "required", "must have", "minimum", "at least", "X+ years". IGNORE any years that appear under "preferred", "nice to have", "bonus", "a plus", "ideally", or "desired".
    * Single value (e.g. "5 years", "5+ years", "at least 5 years") -> use that number (5).
    * A range (e.g. "1-2 years", "3 to 5 years") -> use the LOWER bound (1, 3).
    * MULTIPLE required amounts (e.g. "5+ years overall AND 3+ years with Python") -> use the HIGHEST required number (5).
    * Entry-level, new-grad, internship, or "0-2 years" -> use 0.
    * A seniority TITLE only (e.g. "Senior", "Staff", "Principal") with NO explicit number of years stated anywhere -> use 0. Do NOT infer years from the title.
    * No experience requirement mentioned at all -> use 0.
    * Round partial years down ("18 months" -> 1, "6 months" -> 0).
- "summary" should be a concise description of the role in 1-2 sentences.
- "compensation" should contain ONLY the Salary/Compensation range (e.g., "$92,000 - $147,000 USD"). Do NOT include location or extra text. If absent, set to null.
- "visa_status" should be summarized. If the company does not provide sponsorship or requires existing eligibility, set to exactly "Not eligible for sponsorship". If they DO sponsor, keep it brief (e.g., "Sponsorship Available"). If absent, set to null.
- If a section has no data, return an empty list [] or null as appropriate.
- Return ONLY the JSON object, nothing else."""


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
    # proxy = settings.PROXY_URL if settings.PROXY_URL else None

    async with httpx.AsyncClient(follow_redirects=True) as client:
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
        api_key=api_key or settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        default_headers={
            "HTTP-Referer": "https://goonedin.xyz",
            "X-Title": "HireFeed",
        },
    )

    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
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
            "min_experience_years": None,
            "summary": "Analysis could not be parsed.",
            "compensation": None,
            "visa_status": None,
            "_raw": content,
        }

    return result


async def run_job_analysis(
    external_id: str,
    job_url: str,
    api_key: str,
    description: Optional[str] = None,
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """
    Full analysis pipeline for a single job:
    1. Extract job ID from URL
    2. Fetch job description from LinkedIn API (or use pre-fetched description)
    3. Analyze with DeepSeek
    Returns a tuple of (analysis dict, error message).
    If successful, error is None. If failed, analysis is None and error contains the reason.
    (Caller is responsible for persisting the result.)

    Args:
        description: Pre-fetched description text (e.g. from Indeed scraper).
                     If provided, skips the LinkedIn HTML fetch step.
    """
    import asyncio

    try:
        logger.info(f"[JobAnalyzer] Starting analysis for job {external_id}")

        job_id = external_id
        if not job_id:
            error_msg = f"No job ID provided: {job_url}"
            logger.warning(f"[JobAnalyzer] {error_msg}")
            return None, error_msg

        # Jobright jobs arrive with pre-built analysis from the API,
        # but if one somehow reaches here, skip the LinkedIn-specific fetch
        if "jobright.ai" in job_url:
            logger.info(f"[JobAnalyzer] Skipping DeepSeek for Jobright {job_id} — analysis is pre-built by scraper")
            return None, "Jobright jobs should have pre-built analysis from scraper"

        # 2. Use pre-fetched description if available, otherwise fetch from LinkedIn
        if not description:
            description = await fetch_job_description(job_id)
        if not description:
            error_msg = f"No description found for job {job_id}"
            logger.warning(f"[JobAnalyzer] {error_msg}")
            return None, error_msg

        logger.info(
            f"[JobAnalyzer] Got {len(description)} chars of description for job {external_id}"
        )

        # 3. Analyze with DeepSeek (blocking HTTP, run in thread)
        analysis = await asyncio.to_thread(
            analyze_job_with_deepseek, description, api_key
        )

        logger.info(f"[JobAnalyzer] DeepSeek analysis complete for job {external_id}")
        return analysis, None

    except Exception as e:
        error_msg = f"Analysis failed for job {external_id}: {e}"
        logger.error(f"[JobAnalyzer] {error_msg}")
        return None, error_msg
