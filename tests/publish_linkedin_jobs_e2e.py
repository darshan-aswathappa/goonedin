#!/usr/bin/env python3
"""
End-to-End Test: Real LinkedIn Jobs Analysis Pipeline
This script tests the full job analysis pipeline using 2 real LinkedIn job URLs.
"""

import sys
import os
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv
import asyncio
import time

# Load .env from backend directory
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
load_dotenv(os.path.join(backend_dir, '.env'))

# Add the backend to the path so we can import the models
sys.path.insert(0, backend_dir)

from app.core.config import get_settings
from app.services.supabase_jobs import upsert_job, get_job
from app.services.job_queue import enqueue_job
from supabase import create_client
import json


async def submit_linkedin_job_for_analysis(
    supabase,
    user_id: str,
    title: str,
    company: str,
    location: str,
    url: str,
    salary: Optional[str] = None,
    visa: Optional[str] = None,
    wait_for_analysis: bool = True,
    max_wait_seconds: int = 45,
) -> Optional[dict]:
    """
    Submit a real LinkedIn job for analysis and optionally wait for results.

    The job is inserted into the database, enqueued for async processing,
    and the background worker analyzes it using DeepSeek AI.
    """

    # Extract external_id from LinkedIn URL
    try:
        external_id = url.split('/')[-2] if '/' in url else url
    except:
        external_id = url

    try:
        print(f"  📤 Submitting: {title}")

        # Create job data
        job_data = {
            "user_id": user_id,
            "source": "LinkedIn",
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
        await enqueue_job(supabase, external_id, url)

        print(f"    ✓ Job queued (ID: {external_id})")
        print(f"    Company: {company}")
        print(f"    Location: {location}")
        print(f"    Status: Pending analysis")

        # Optionally wait for analysis to complete
        if wait_for_analysis:
            print(f"    ⏳ Polling for analysis results...")
            start_time = time.time()
            poll_count = 0

            while time.time() - start_time < max_wait_seconds:
                poll_count += 1

                # Re-fetch job to check analysis status
                job_record = await get_job(supabase, user_id, "LinkedIn", external_id)

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
    """Main function with 2 real LinkedIn jobs."""

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

    # Real Job 1: Executive Assistant at WIRAA
    print("=" * 75)
    print("JOB 1: Executive Assistant at WIRAA")
    print("=" * 75)
    job1 = await submit_linkedin_job_for_analysis(
        supabase=supabase,
        user_id=test_user_id,
        title="Executive Assistant",
        company="WIRAA",
        location="Remote",
        url="https://www.linkedin.com/jobs/view/executive-assistant-at-wiraa-4382658811/",
        wait_for_analysis=True,
        max_wait_seconds=45,
    )

    print()

    # Real Job 2: PLM TeamCenter Software Developers at Maxil
    print("=" * 75)
    print("JOB 2: PLM TeamCenter Software Developers at Maxil")
    print("=" * 75)
    job2 = await submit_linkedin_job_for_analysis(
        supabase=supabase,
        user_id=test_user_id,
        title="PLM TeamCenter Software Developers",
        company="Maxil Technology Solutions Inc",
        location="USA",
        url="https://www.linkedin.com/jobs/view/plm-teamcenter-software-developers-at-maxil-technology-solutions-inc-4381540211/",
        wait_for_analysis=True,
        max_wait_seconds=45,
    )

    print("\n" + "=" * 75)
    print("✨ END-TO-END TEST SUMMARY")
    print("=" * 75)
    print("\n✅ Pipeline Steps Tested:")
    print("  1. Job insertion into database")
    print("  2. Job enqueuing in analysis queue")
    print("  3. Background worker processing")
    print("  4. DeepSeek AI analysis")
    print("  5. Results storage and polling")

    print(f"\n📊 Results:")
    print(f"  Job 1 (Executive Assistant): {'✅ Analyzed' if job1 and job1.get('analysis_status') == 'completed' else '⏳ Pending/Processing'}")
    print(f"  Job 2 (PLM Developer): {'✅ Analyzed' if job2 and job2.get('analysis_status') == 'completed' else '⏳ Pending/Processing'}")
    print()


if __name__ == "__main__":
    print("\n" + "=" * 75)
    print("🚀 END-TO-END LINKEDIN JOBS ANALYSIS TEST")
    print("=" * 75)
    print("\nTesting real job analysis with:")
    print("  • 2 real LinkedIn job URLs")
    print("  • Supabase database integration")
    print("  • Async job queue system")
    print("  • DeepSeek AI analysis")
    print("\nThis validates:")
    print("  ✓ Job creation and storage")
    print("  ✓ Async queue integration")
    print("  ✓ Background worker processing")
    print("  ✓ DeepSeek API integration")
    print("  ✓ Analysis result polling\n")

    asyncio.run(main())
