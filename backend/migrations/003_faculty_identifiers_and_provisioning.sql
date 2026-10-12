-- ══════════════════════════════════════════════════════════
-- Migration 003: Faculty Identifiers & Institutional Provisioning
-- ══════════════════════════════════════════════════════════

-- 1. Add employee_id to faculty_profiles if not already present
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;

-- 2. Safe, idempotent institutional faculty account provisioning
DO $$
DECLARE
  v_faculty_user_id UUID;
BEGIN
  -- If faculty.cs@met.edu already exists (e.g. previously registered under test as student), configure as canonical faculty
  IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = 'faculty.cs@met.edu') THEN
    UPDATE users
    SET role = 'faculty',
        status = 'active',
        password_hash = '$2b$12$iPpsVHi/F6EdQPNX6/3t7.3eXJjCfK.PTDdsM52NrvdX2tEcZPb5O',
        first_name = 'Ramesh',
        last_name = 'Deshmukh',
        phone = COALESCE(phone, '9820234567'),
        updated_at = NOW()
    WHERE LOWER(email) = 'faculty.cs@met.edu'
    RETURNING id INTO v_faculty_user_id;

    -- Clean up any erroneous student profile attached to this faculty email
    DELETE FROM student_profiles WHERE user_id = v_faculty_user_id;

    -- Upsert faculty profile
    IF EXISTS (SELECT 1 FROM faculty_profiles WHERE user_id = v_faculty_user_id) THEN
      UPDATE faculty_profiles
      SET employee_id = 'FAC042',
          college = 'MET Institute of Engineering, Nashik',
          department = 'Computer Engineering & IT',
          designation = 'Associate Professor & Mentorship Lead',
          role_label = 'Associate Professor & Mentorship Lead',
          updated_at = NOW()
      WHERE user_id = v_faculty_user_id;
    ELSE
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
    END IF;

    INSERT INTO user_settings (user_id)
    VALUES (v_faculty_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  -- Otherwise, if no active faculty exists, provision a new faculty account
  ELSIF NOT EXISTS (SELECT 1 FROM users WHERE role = 'faculty' AND status = 'active') THEN
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
