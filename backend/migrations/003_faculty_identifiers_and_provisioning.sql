-- ══════════════════════════════════════════════════════════
-- Migration 003: Faculty Identifiers & Institutional Provisioning
-- ══════════════════════════════════════════════════════════

-- 1. Add employee_id to faculty_profiles if not already present
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;

-- 2. Safe, idempotent institutional faculty account provisioning
-- Ensures at least one authorized faculty account exists for the Faculty Portal
DO $$
DECLARE
  v_faculty_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'faculty' AND status = 'active') THEN
    INSERT INTO users (
      email,
      password_hash,
      role,
      status,
      first_name,
      last_name,
      phone,
      created_at,
      updated_at
    )
    VALUES (
      'faculty.cs@met.edu',
      '$2b$12$iPpsVHi/F6EdQPNX6/3t7.3eXJjCfK.PTDdsM52NrvdX2tEcZPb5O',
      'faculty',
      'active',
      'Ramesh',
      'Deshmukh',
      '9820234567',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_faculty_user_id;

    INSERT INTO faculty_profiles (
      user_id,
      college,
      department,
      designation,
      role_label,
      employee_id,
      created_at,
      updated_at
    )
    VALUES (
      v_faculty_user_id,
      'MET Institute of Engineering, Nashik',
      'Computer Engineering & IT',
      'Associate Professor & Mentorship Lead',
      'Associate Professor & Mentorship Lead',
      'FAC042',
      NOW(),
      NOW()
    );

    INSERT INTO user_settings (user_id)
    VALUES (v_faculty_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
