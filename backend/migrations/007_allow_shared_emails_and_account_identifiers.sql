-- ══════════════════════════════════════════════════════════
-- Migration 007: Allow Shared Emails & Unique Account Identifiers
-- Version: 007_allow_shared_emails_and_account_identifiers
-- ══════════════════════════════════════════════════════════

-- 1. Safely drop the existing UNIQUE index on users(LOWER(email))
DROP INDEX IF EXISTS idx_users_email;

-- 2. Re-create a non-unique index on users(LOWER(email)) for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));

-- 3. Add explicit username column to users table if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);

-- 4. Case-insensitive unique partial index for usernames (where provided)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username)) WHERE username IS NOT NULL;

-- 5. Backfill username for existing student accounts from their roll numbers
UPDATE users u
SET username = sp.roll_number
FROM student_profiles sp
WHERE sp.user_id = u.id AND u.username IS NULL AND sp.roll_number IS NOT NULL;

-- 6. Backfill username for existing faculty accounts from their employee IDs
UPDATE users u
SET username = fp.employee_id
FROM faculty_profiles fp
WHERE fp.user_id = u.id AND u.username IS NULL AND fp.employee_id IS NOT NULL;

-- 7. Ensure student roll numbers remain strictly unique per student profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_roll ON student_profiles (UPPER(roll_number));

-- 8. Ensure faculty employee IDs remain strictly unique per faculty profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;
