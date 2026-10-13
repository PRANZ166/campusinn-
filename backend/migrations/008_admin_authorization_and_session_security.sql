-- ══════════════════════════════════════════════════════════
-- Campus Inn+ — Database Migration: Admin Authorization, Session Invalidation & Audit
-- Version: 008_admin_authorization_and_session_security
-- ══════════════════════════════════════════════════════════

-- 1. Add token_version to users table for granular session invalidation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;

-- 2. Ensure indexes on audit_log for fast chronological querying
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_log (actor_id, created_at DESC);

-- 3. Ensure coordinator_profiles has unique constraint on user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_coordinator_profiles_user_id ON coordinator_profiles (user_id);
