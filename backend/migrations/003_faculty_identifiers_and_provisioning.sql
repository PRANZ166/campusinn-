-- ══════════════════════════════════════════════════════════
-- Migration 003: Faculty Identifiers & Institutional Provisioning
-- ══════════════════════════════════════════════════════════

-- 1. Add employee_id to faculty_profiles if not already present
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;
