-- ══════════════════════════════════════════════════════════
-- Migration 005: Multi-Role Onboarding, Status & Profile Tables
-- ══════════════════════════════════════════════════════════

-- 1. Ensure 'pending' is an allowed account_status
DO $$ BEGIN
  ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure coordinator_profiles table exists
CREATE TABLE IF NOT EXISTS coordinator_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department      VARCHAR(150),
  club_name       VARCHAR(150),
  role_label      VARCHAR(150),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_coordinator_profiles_user ON coordinator_profiles (user_id);

-- 3. Ensure recruiter_profiles table exists
CREATE TABLE IF NOT EXISTS recruiter_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  company_name    VARCHAR(255),
  designation     VARCHAR(150),
  role_label      VARCHAR(150),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_recruiter_profiles_user ON recruiter_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_profiles_company ON recruiter_profiles (company_id);
