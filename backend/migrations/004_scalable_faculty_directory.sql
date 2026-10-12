-- ══════════════════════════════════════════════════════════
-- Migration 004: Scalable Faculty Directory & Onboarding Indexing
-- ══════════════════════════════════════════════════════════

-- Ensure faculty_profiles has all scalable fields
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS designation VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS college VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS role_label VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS cabin_number VARCHAR(100);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS office_hours VARCHAR(255);

-- Ensure case-insensitive unique employee_id index
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;

-- Fast index for user lookups by role and status
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));
