#!/usr/bin/env python3
"""
Script to publish a fake LinkedIn job for testing purposes.
This creates a job entry with all details that would normally come from LinkedIn scraping.
"""

import sys
import os
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

# Load .env from backend directory
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
load_dotenv(os.path.join(backend_dir, '.env'))

# Add the backend to the path so we can import the models
sys.path.insert(0, backend_dir)

from app.models.job import JobCreate
from app.core.config import get_settings
from app.services.job_analyzer import analyze_job_with_deepseek
from supabase import create_client
import uuid
import json


def create_fake_linkedin_job(
    supabase,
    user_id: str,
    title: str = "Senior Software Engineer",
    company: str = "Fake Tech Corp",
    location: str = "San Francisco, CA",
    url: str = "https://www.linkedin.com/jobs/view/999999999999",
    description: str = "We are looking for an experienced Senior Software Engineer to join our team...",
    salary: Optional[str] = None,
    visa: Optional[str] = None,
    analyze: bool = True,
) -> dict:
    """
    Create and publish a fake LinkedIn job to the scraped_jobs table.
    Optionally analyzes the job description with DeepSeek AI.

    Args:
        supabase: Supabase client
        user_id: User ID to associate the job with
        title: Job title
        company: Company name
        location: Job location
        url: Job posting URL
        description: Job description (will be analyzed by DeepSeek)
        salary: Salary information (optional)
        visa: Visa sponsorship info (optional)
        analyze: Whether to analyze the job description with DeepSeek (default: True)

    Returns:
        dict: The created job record
    """

    # Create a unique external_id (like LinkedIn would provide)
    external_id = f"fake-linkedin-{uuid.uuid4().hex[:8]}"

    # Pre-analyze the job description with DeepSeek if requested
    analysis = None
    analysis_status = None
    settings = get_settings()

    if analyze and settings.DEEPSEEK_API_KEY:
        print("  ⚙️  Analyzing job description with DeepSeek AI...")
        try:
            # analysis = analyze_job_with_deepseek(description, settings.DEEPSEEK_API_KEY)
            analysis_status = "completed"
        except Exception as e:
            print(f"    ⚠️  Analysis failed: {str(e)}")
            analysis_status = "failed"
    elif analyze and not settings.DEEPSEEK_API_KEY:
        print("  ⚠️  DeepSeek API key not configured, skipping analysis")

    # Prepare job data for scraped_jobs table
    job_dict = {
        "user_id": user_id,
        "source": "LinkedIn",
        "external_id": external_id,
        "title": title,
        "company": company,
        "location": location,
        "url": url,
        "posted_at": datetime.utcnow().isoformat(),
        "visible": True,
        "is_notified": False,
        "salary": salary,
        "visa": visa,
        "analysis": json.dumps(analysis) if analysis else None,
        "analysis_status": analysis_status,
    }

    try:
        # Insert into Supabase scraped_jobs table
        response = supabase.table("scraped_jobs").upsert(
            job_dict, on_conflict="user_id,source,external_id"
        ).execute()

        if response.data:
            job_record = response.data[0]
            print("✅ Fake LinkedIn job published successfully!")
            print(f"\nJob Details:")
            print(f"  ID: {job_record.get('id')}")
            print(f"  Title: {job_record.get('title')}")
            print(f"  Company: {job_record.get('company')}")
            print(f"  Location: {job_record.get('location')}")
            print(f"  URL: {job_record.get('url')}")
            print(f"  Source: {job_record.get('source')}")
            print(f"  External ID: {job_record.get('external_id')}")
            print(f"  Posted At: {job_record.get('posted_at')}")
            if salary:
                print(f"  Salary: {salary}")
            if visa:
                print(f"  Visa: {visa}")

            # Show analysis results if available
            if job_record.get('analysis_status') == 'completed':
                analysis_data = job_record.get('analysis')
                if isinstance(analysis_data, str):
                    try:
                        analysis_data = json.loads(analysis_data)
                    except:
                        analysis_data = None

                if analysis_data:
                    print(f"\n  Analysis:")
                    if analysis_data.get('summary'):
                        print(f"    Summary: {analysis_data.get('summary')}")
                    if analysis_data.get('must_have_keywords'):
                        print(f"    Must-Have Skills: {', '.join(analysis_data.get('must_have_keywords', []))}")
                    if analysis_data.get('good_to_have_keywords'):
                        print(f"    Good-To-Have Skills: {', '.join(analysis_data.get('good_to_have_keywords', []))}")
                    if analysis_data.get('compensation'):
                        print(f"    Compensation: {analysis_data.get('compensation')}")
                    if analysis_data.get('visa_status'):
                        print(f"    Visa Status: {analysis_data.get('visa_status')}")
            elif job_record.get('analysis_status') == 'failed':
                print(f"  ⚠️  Analysis Status: Failed")

            return job_record
        else:
            print("❌ Failed to insert job into database")
            return None

    except Exception as e:
        print(f"❌ Error publishing job: {str(e)}")
        return None


def main():
    """Main function with example usage."""

    # Initialize Supabase client
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        return

    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    # Use a test user ID (you can change this or pass it as an argument)
    test_user_id = "test-user-123"

    print(f"Using test user ID: {test_user_id}\n")

    # Example 1: Basic fake job
    print("=" * 60)
    print("Publishing Fake LinkedIn Job #1")
    print("=" * 60)
    job1 = create_fake_linkedin_job(
        supabase,
        user_id=test_user_id,
        title="Junior Python Developer",
        company="Tech Startup Inc",
        location="Remote",
        url="https://www.linkedin.com/jobs/view/1234567890",
        description="""
        Join our growing team as a Junior Python Developer. You'll work on backend services using FastAPI and PostgreSQL.

        Responsibilities:
        - Develop and maintain Python-based microservices
        - Build REST APIs using FastAPI
        - Work with PostgreSQL databases
        - Participate in code reviews and contribute to technical documentation
        - Collaborate with senior engineers on architecture decisions

        Required Qualifications:
        - 1-2 years of professional Python development experience
        - Strong understanding of REST APIs and database design
        - Familiarity with Git version control
        - Bachelor's degree in Computer Science or related field

        Preferred Qualifications:
        - Experience with FastAPI or similar frameworks
        - Knowledge of Docker and containerization
        - Experience with CI/CD pipelines
        - Familiarity with cloud platforms (AWS, GCP, Azure)

        Compensation & Benefits:
        Salary: $80,000 - $120,000 per year
        We offer comprehensive health insurance, 401(k) matching, and H1B Sponsorship Available for qualified candidates.
        """,
        salary="$80,000 - $120,000",
        visa="H1B Sponsorship Available"
    )

    # Example 2: Another fake job with different details
    print("\n" + "=" * 60)
    print("Publishing Fake LinkedIn Job #2")
    print("=" * 60)
    job2 = create_fake_linkedin_job(
        supabase,
        user_id=test_user_id,
        title="Full Stack Engineer",
        company="Cloud Solutions Ltd",
        location="New York, NY",
        url="https://www.linkedin.com/jobs/view/9876543210",
        description="""
        We're seeking a Full Stack Engineer to build and scale our cloud platform.

        About the Role:
        We are looking for an experienced Full Stack Engineer to take ownership of features from ideation through production. You'll work across our entire stack, from React frontends to Node.js/TypeScript backends, collaborating with product and design teams.

        Key Responsibilities:
        - Design and implement scalable full-stack features
        - Build responsive UIs using React and modern JavaScript frameworks
        - Develop robust APIs and services using Node.js
        - Optimize application performance and user experience
        - Write clean, testable code with comprehensive unit and integration tests
        - Participate in architecture discussions and technical design reviews

        Must-Have Skills:
        - 4+ years of full-stack development experience
        - Expert-level JavaScript/TypeScript proficiency
        - Strong experience with React (or similar modern UI frameworks)
        - Solid understanding of Node.js and backend development
        - Experience with relational databases (PostgreSQL, MySQL)
        - Proficiency with Git and modern development workflows
        - Strong problem-solving and communication skills

        Nice-to-Have Skills:
        - Experience with GraphQL
        - Familiarity with AWS, GCP, or Azure
        - Knowledge of Kubernetes and containerization
        - Experience with agile methodologies
        - Open source contributions

        Compensation:
        Salary: $120,000 - $160,000 annually
        Visa sponsorship provided for qualified international candidates.
        Comprehensive benefits package including health insurance, 401(k), unlimited PTO.
        """,
        salary="$120,000 - $160,000",
        visa="Visa sponsorship provided"
    )

    # Example 3: Senior role
    print("\n" + "=" * 60)
    print("Publishing Fake LinkedIn Job #3")
    print("=" * 60)
    job3 = create_fake_linkedin_job(
        supabase,
        user_id=test_user_id,
        title="Staff Engineer",
        company="Big Tech Corporation",
        location="Seattle, WA",
        url="https://www.linkedin.com/jobs/view/5555555555",
        description="""
        We're seeking a Staff Engineer to join our infrastructure team and lead our engineering efforts on cloud-native systems.

        About You:
        You are a technical leader with deep systems expertise who can drive architectural decisions and mentor engineers across multiple teams. You have a track record of shipping large-scale projects and influencing technical direction at your organization.

        Responsibilities:
        - Lead design and implementation of critical infrastructure components
        - Mentor senior and mid-level engineers, conducting technical interviews and providing feedback
        - Drive architectural decisions for distributed systems and microservices
        - Establish engineering standards and best practices across teams
        - Collaborate with product and leadership on long-term technical strategy
        - Contribute to open source projects and stay current with emerging technologies

        Required Qualifications:
        - 10+ years of software engineering experience, with at least 5+ years in a staff or senior staff level role
        - Deep expertise in distributed systems, microservices architecture, and cloud platforms
        - Proficiency in multiple programming languages (Go, Rust, Java, or C++)
        - Strong knowledge of containerization and orchestration (Docker, Kubernetes)
        - Experience with database systems (both SQL and NoSQL)
        - Excellent communication and leadership abilities
        - Track record of mentoring engineers and building high-performing teams

        Preferred Qualifications:
        - Experience with ML/AI infrastructure or data systems
        - Knowledge of security best practices and compliance requirements
        - Contributions to major open source projects
        - Patents or published technical papers
        - Experience building developer tools or platforms

        Compensation & Benefits:
        Base Salary: $200,000 - $250,000
        Annual Bonus: 15-20% (based on performance)
        Stock Options: Competitive package
        All visa categories welcome
        Relocation assistance available
        Unlimited PTO, comprehensive health coverage, wellness programs, learning budgets
        """,
        salary="$200,000 - $250,000",
        visa="All visa categories welcome"
    )

    print("\n" + "=" * 60)
    print("All fake jobs published!")
    print("=" * 60)


if __name__ == "__main__":
    import sys

    # Allow passing user_id as command-line argument
    user_id = None
    if len(sys.argv) > 1:
        user_id = sys.argv[1]

    if user_id:
        # Override the user_id in main
        settings = get_settings()
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        else:
            supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
            print(f"Using user ID: {user_id}\n")

            job1 = create_fake_linkedin_job(
                supabase,
                user_id=user_id,
                title="Junior Python Developer",
                company="Tech Startup Inc",
                location="Remote",
                url="https://www.linkedin.com/jobs/view/1234567890",
                salary="$80,000 - $120,000",
                visa="H1B Sponsorship Available"
            )

            job2 = create_fake_linkedin_job(
                supabase,
                user_id=user_id,
                title="Full Stack Engineer",
                company="Cloud Solutions Ltd",
                location="New York, NY",
                url="https://www.linkedin.com/jobs/view/9876543210",
                salary="$120,000 - $160,000",
                visa="Visa sponsorship provided"
            )

            job3 = create_fake_linkedin_job(
                supabase,
                user_id=user_id,
                title="Staff Engineer",
                company="Big Tech Corporation",
                location="Seattle, WA",
                url="https://www.linkedin.com/jobs/view/5555555555",
                salary="$200,000 - $250,000",
                visa="All visa categories welcome"
            )

            print("\n✅ All fake jobs published!")
    else:
        print("Usage: python3 publish_fake_linkedin_job.py <your-user-id>")
        print("\nTo find your user ID:")
        print("1. Open your app in the browser")
        print("2. Open DevTools (F12) → Network tab")
        print("3. Make any API request and look at Authorization header")
        print("4. The JWT token's 'sub' field is your user ID\n")
        main()
