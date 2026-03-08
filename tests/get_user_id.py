#!/usr/bin/env python3
"""
Helper script to find your user ID from Supabase.
This shows all users in the system.
"""

import sys
import os
from dotenv import load_dotenv

# Load .env and add backend to path FIRST
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_dir)
load_dotenv(os.path.join(backend_dir, '.env'))

from app.core.config import get_settings
from supabase import create_client

def main():
    """Fetch and display all user IDs from Supabase."""
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        return

    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    print("Fetching all users from Supabase...\n")

    try:
        # Fetch user configs
        response = supabase.table("user_configs").select("*").execute()
        users = response.data

        if not users:
            print("❌ No users found in the system")
            print("\nYou need to sign up/login to the app first to create a user account.")
            return

        print(f"Found {len(users)} user(s):\n")
        for i, user in enumerate(users, 1):
            user_id = user.get("user_id")
            print(f"{i}. User ID: {user_id}")

        print("\n✅ Use one of these user IDs with the publish script:")
        print(f"   python3 publish_fake_linkedin_job.py <user-id>")
        print(f"\nExample:")
        if users:
            example_id = users[0].get("user_id")
            print(f"   python3 publish_fake_linkedin_job.py {example_id}")

    except Exception as e:
        print(f"❌ Error fetching users: {str(e)}")


if __name__ == "__main__":
    main()
