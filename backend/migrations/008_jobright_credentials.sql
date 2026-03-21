-- Migration 008: Per-user Jobright credentials
-- Run on Supabase SQL editor before deploying the backend changes.
--
-- Adds two nullable columns to user_settings so each user can store
-- their own Jobright email and password. Existing rows automatically
-- get NULL (no backfill required). The seed_settings_if_missing() call
-- at login time already inserts a row for every user, so UPDATE (not
-- UPSERT) is safe from the application layer.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS jobright_email    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jobright_password TEXT DEFAULT NULL;
