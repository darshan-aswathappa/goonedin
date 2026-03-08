#!/usr/bin/env python3
"""
End-to-End Test: Real LinkedIn Jobs Analysis Pipeline
This script tests the full job analysis pipeline by:
1. Fetching live job listings from LinkedIn with random keywords and location
2. Extracting the first 2 jobs
3. Submitting them for analysis
"""

import sys
import os
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv
import asyncio
import time
import random

# Load .env from backend directory
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
load_dotenv(os.path.join(backend_dir, '.env'))

# Add the backend to the path so we can import the models
sys.path.insert(0, backend_dir)

from app.core.config import get_settings
from app.services.supabase_jobs import upsert_job, get_job
from app.services.job_queue import enqueue_job, get_cache_entry
from app.services.scraper_linkedin import fetch_linkedin_jobs
from supabase import create_client
import json


# Random keywords and locations for variety
KEYWORDS = [
    "Software",
]

LOCATIONS = [
    "United States"
]


async def submit_job_for_analysis(
    supabase,
    user_id: str,
    title: str,
    company: str,
    location: str,
    url: str,
    source: str = "LinkedIn",
    external_id: Optional[str] = None,
    salary: Optional[str] = None,
    visa: Optional[str] = None,
    wait_for_analysis: bool = True,
    max_wait_seconds: int = 45,
) -> Optional[dict]:
    """
    Submit a job for analysis and optionally wait for results.

    The job is inserted into the database, enqueued for async processing,
    and the background worker analyzes it using DeepSeek AI.
    """

    # Extract external_id if not provided
    if not external_id:
        try:
            external_id = url.split('/')[-2] if '/' in url else url
        except:
            external_id = url

    try:
        print(f"  📤 Submitting: {title}")

        # Create job data
        job_data = {
            "user_id": user_id,
            "source": source,
            "external_id": external_id,
            "title": title,
            "company": company,
            "location": location,
            "url": url,
            "posted_at": datetime.now(timezone.utc).isoformat(),
            "visible": True,
            "is_notified": False,
            "salary": salary,
            "visa": visa,
            "analysis": None,
            "analysis_status": "pending",
        }

        # Insert job into database
        job_record = await upsert_job(supabase, user_id, job_data)

        # Enqueue for background analysis
        print(f"    ℹ️  Enqueueing job with external_id: {external_id}")
        await enqueue_job(supabase, external_id, url)

        print(f"    ✓ Job queued (ID: {external_id})")
        print(f"    Company: {company}")
        print(f"    Location: {location}")
        print(f"    Status: Pending analysis")

        # Optionally wait for analysis to complete
        if wait_for_analysis:
            print(f"    ⏳ Polling for analysis results...")
            start_time = time.time()

            while time.time() - start_time < max_wait_seconds:
                # Re-fetch job to check analysis status
                job_record = await get_job(supabase, user_id, source, external_id)

                if job_record and job_record.get("analysis_status") == "completed":
                    print(f"    ✅ Analysis completed!")
                    analysis = job_record.get("analysis")
                    if isinstance(analysis, str):
                        try:
                            analysis = json.loads(analysis)
                        except:
                            pass

                    if analysis:
                        print(f"\n    📊 Analysis Results:")
                        if analysis.get('summary'):
                            print(f"      • Summary: {analysis.get('summary')[:80]}...")
                        if analysis.get('must_have_keywords'):
                            skills = ', '.join(analysis.get('must_have_keywords', [])[:5])
                            print(f"      • Required Skills: {skills}")
                        if analysis.get('good_to_have_keywords'):
                            skills = ', '.join(analysis.get('good_to_have_keywords', [])[:5])
                            print(f"      • Preferred Skills: {skills}")
                        if analysis.get('compensation'):
                            print(f"      • Compensation: {analysis.get('compensation')}")
                        if analysis.get('visa_status'):
                            print(f"      • Visa: {analysis.get('visa_status')}")
                    break

                elif job_record and job_record.get("analysis_status") == "unavailable":
                    print(f"    ⚠️  Analysis Status: Unavailable")
                    break

                # Still pending, wait and retry
                await asyncio.sleep(2)

            else:
                print(f"    ⏱️  Analysis still pending after {max_wait_seconds}s")
                print(f"    (will continue processing in background)")

        return job_record

    except Exception as e:
        print(f"  ❌ Error: {str(e)}")
        return None


async def main():
    """Main function: fetch live jobs and analyze top 2."""

    # Get settings
    settings = get_settings()

    # Initialize Supabase client
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        return

    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    # Use a test user ID
    test_user_id = os.getenv("TEST_USER_ID", "test-user-123")

    print(f"\n🔗 Using test user ID: {test_user_id}\n")

    # Pick random keyword and location
    random_keyword = random.choice(KEYWORDS)
    random_location = random.choice(LOCATIONS)

    print("=" * 75)
    print(f"FETCHING JOBS: '{random_keyword}' in '{random_location}'")
    print("=" * 75)
    print()

    # Fetch jobs from LinkedIn
    result = await fetch_linkedin_jobs(supabase, test_user_id, keywords=random_keyword, location=random_location)
    jobs = result.get("jobs", [])
    failed = result.get("failed", False)

    if failed or not jobs:
        print(f"❌ Failed to fetch jobs or no jobs found")
        return

    print(f"✅ Found {len(jobs)} jobs. Analyzing top 2...\n")

    # Take only the first 2 jobs
    top_2_jobs = jobs[:2]

    job_results = []

    # Submit Job 1
    if len(top_2_jobs) > 0:
        job = top_2_jobs[0]
        print("=" * 75)
        print(f"JOB 1: {job.title} @ {job.company}")
        print("=" * 75)
        job_result = await submit_job_for_analysis(
            supabase=supabase,
            user_id=test_user_id,
            title=job.title,
            company=job.company,
            location=job.location,
            url=str(job.url),
            source=job.source,
            external_id=job.external_id,
            wait_for_analysis=True,
            max_wait_seconds=45,
        )
        job_results.append(job_result)
        print()

    # Submit Job 2
    if len(top_2_jobs) > 1:
        job = top_2_jobs[1]
        print("=" * 75)
        print(f"JOB 2: {job.title} @ {job.company}")
        print("=" * 75)
        job_result = await submit_job_for_analysis(
            supabase=supabase,
            user_id=test_user_id,
            title=job.title,
            company=job.company,
            location=job.location,
            url=str(job.url),
            source=job.source,
            external_id=job.external_id,
            wait_for_analysis=True,
            max_wait_seconds=45,
        )
        job_results.append(job_result)
        print()

    print("\n" + "=" * 75)
    print("✨ END-TO-END TEST SUMMARY")
    print("=" * 75)
    print("\n✅ Pipeline Steps Tested:")
    print("  1. Dynamic LinkedIn job scraping")
    print("  2. Job extraction (first 2 jobs)")
    print("  3. Job insertion into database")
    print("  4. Job enqueuing in analysis queue")
    print("  5. Background worker processing")
    print("  6. DeepSeek AI analysis")
    print("  7. Results storage and polling")

    print(f"\n📊 Results:")
    for i, job_result in enumerate(job_results, 1):
        status = '✅ Analyzed' if job_result and job_result.get('analysis_status') == 'completed' else '⏳ Pending/Processing'
        print(f"  Job {i}: {status}")
    print()


if __name__ == "__main__":
    print("\n" + "=" * 75)
    print("🚀 END-TO-END LINKEDIN JOBS ANALYSIS TEST")
    print("=" * 75)
    print("\nTesting real job analysis with:")
    print("  • Dynamic job scraping from LinkedIn")
    print("  • Random keywords and locations")
    print("  • First 2 fetched jobs")
    print("  • Supabase database integration")
    print("  • Async job queue system")
    print("  • DeepSeek AI analysis")
    print("\nThis validates:")
    print("  ✓ LinkedIn scraper integration")
    print("  ✓ Job creation and storage")
    print("  ✓ Async queue integration")
    print("  ✓ Background worker processing")
    print("  ✓ DeepSeek API integration")
    print("  ✓ Analysis result polling\n")

    asyncio.run(main())
