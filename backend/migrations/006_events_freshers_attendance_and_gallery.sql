-- ══════════════════════════════════════════════════════════
-- Campus Inn+ — Database Migration: Events, Freshers & Gallery
-- Version: 006_events_freshers_attendance_and_gallery
-- ══════════════════════════════════════════════════════════

-- 1. Ensure Standard Institutional Departments
INSERT INTO departments (name, college)
VALUES 
  ('Computer Engineering', 'MET Institute of Engineering, Nashik'),
  ('Information Technology', 'MET Institute of Engineering, Nashik'),
  ('Computer Applications', 'MET Institute of Technology, Nashik'),
  ('Management', 'MET Institute of Management, Nashik'),
  ('Pharmacy', 'MET Institute of Pharmacy, Nashik'),
  ('Mechanical Engineering', 'MET Institute of Engineering, Nashik'),
  ('Civil Engineering', 'MET Institute of Engineering, Nashik')
ON CONFLICT (name, college) DO NOTHING;

-- 2. Enhance Events Table with Freshers and Capacity Attributes
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS department_name VARCHAR(150);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_open TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 day';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_close TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS is_freshers BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 500;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'other';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_freshers ON events (is_freshers, department_name);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events (date_start, date_end);

-- 3. Enhance Event Registrations Table
DO $$ BEGIN
  ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'registered';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS department VARCHAR(150);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS team_name VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS pass_code VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_reg_status ON event_registrations (status);
CREATE INDEX IF NOT EXISTS idx_event_reg_pass ON event_registrations (pass_code);

-- 4. Event Attendance Table (Real, Auditable Attendance Records)
CREATE TABLE IF NOT EXISTS event_attendance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roll_number     VARCHAR(50) NOT NULL,
  department      VARCHAR(150) NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'present',
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by       UUID REFERENCES users(id),
  pass_code       VARCHAR(64) NOT NULL UNIQUE,
  attendance_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_event ON event_attendance (event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_user ON event_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_roll ON event_attendance (UPPER(roll_number));
CREATE INDEX IF NOT EXISTS idx_event_attendance_dept ON event_attendance (department);

-- 5. Event Photos Table (Coordinator Uploads & Student Gallery)
CREATE TABLE IF NOT EXISTS event_photos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  file_url        TEXT NOT NULL,
  storage_key     TEXT,
  caption         VARCHAR(300),
  is_published    BOOLEAN NOT NULL DEFAULT true,
  file_size       INTEGER,
  mime_type       VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_photos_event ON event_photos (event_id, is_published);
CREATE INDEX IF NOT EXISTS idx_event_photos_uploader ON event_photos (uploaded_by);

-- 6. Provision Institutional Default Events Safely
DO $$
DECLARE
  admin_uid UUID;
  dept_comp UUID;
  dept_mgmt UUID;
  dept_ca UUID;
  dept_pharm UUID;
BEGIN
  -- Find an administrative or coordinator account
  SELECT id INTO admin_uid FROM users WHERE role IN ('admin', 'coordinator') ORDER BY created_at ASC LIMIT 1;
  IF admin_uid IS NULL THEN
    SELECT id INTO admin_uid FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  SELECT id INTO dept_comp FROM departments WHERE LOWER(name) LIKE '%computer engineering%' LIMIT 1;
  SELECT id INTO dept_mgmt FROM departments WHERE LOWER(name) LIKE '%management%' LIMIT 1;
  SELECT id INTO dept_ca FROM departments WHERE LOWER(name) LIKE '%application%' LIMIT 1;
  SELECT id INTO dept_pharm FROM departments WHERE LOWER(name) LIKE '%pharmacy%' LIMIT 1;

  IF admin_uid IS NOT NULL THEN
    -- A. Collegiate Headliners (Open to all eligible campus students)
    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%techfest%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, created_by, created_at, updated_at)
      VALUES (
        'MET TechFest 2026',
        'Central flagship multi-track hackathon spanning AI/ML, Decentralized Web3, and IoT Robotics. ₹3.5 Lakhs Prize Pool.',
        'technical',
        'Flagship Annual Tech Conclave',
        NOW() + INTERVAL '5 days',
        NOW() + INTERVAL '7 days',
        'MET BKC Central Auditorium & Advanced Computing Labs',
        850,
        850,
        true,
        false,
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%utsav%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, created_by, created_at, updated_at)
      VALUES (
        'MET UTSAV 2026',
        'The grand collegiate extravaganza bringing together all constituent institutes of Bhujbal Knowledge City. Kalarang Folk Showcases, Battle of Bands, and Pageant.',
        'cultural',
        'Annual Flagship Festival',
        NOW() + INTERVAL '14 days',
        NOW() + INTERVAL '16 days',
        'Main Open Amphitheatre & Central Lawns',
        2000,
        2000,
        true,
        false,
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%hackbkc%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, created_by, created_at, updated_at)
      VALUES (
        'HackBKC 2026: Intercollege Hackathon',
        '36 hours of continuous product engineering across Generative AI, Web3, and IoT. Co-mentored by technical architects with on-spot placement interview clearances.',
        'hackathon',
        'National Developer Initiative',
        NOW() + INTERVAL '20 days',
        NOW() + INTERVAL '21 days',
        'Advanced Computing Labs, IOE',
        350,
        350,
        true,
        false,
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%kalarang%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, created_by, created_at, updated_at)
      VALUES (
        'Kalarang 2026: Classical & Folk Arts Fiesta',
        'Annual classical music and folk theater gathering honoring Maharashtrian cultural heritage and intercollegiate fine arts.',
        'cultural',
        'Cultural Guild',
        NOW() + INTERVAL '30 days',
        NOW() + INTERVAL '31 days',
        'MET BKC Main Auditorium',
        600,
        600,
        true,
        false,
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    -- B. Department-Specific Freshers (Each bound to exactly ONE department)
    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%init%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, department_id, department_name, created_by, created_at, updated_at)
      VALUES (
        'Init 2025: Engineering Induction',
        'Authorized departmental orientation and welcome celebrations for newly inducted B.Tech Computer Engineering & IT students.',
        'cultural',
        'Department Freshers',
        NOW() + INTERVAL '2 days',
        NOW() + INTERVAL '2 days 6 hours',
        'IOE Main Auditorium',
        400,
        400,
        true,
        true,
        dept_comp,
        'Computer Engineering',
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%genesis%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, department_id, department_name, created_by, created_at, updated_at)
      VALUES (
        'Genesis 2025: BCA & MCA Induction',
        'Departmental orientation, alumni networking, and welcome gala for Computer Applications (BCA & MCA) freshers.',
        'cultural',
        'Department Freshers',
        NOW() + INTERVAL '3 days',
        NOW() + INTERVAL '3 days 6 hours',
        'MET Amphitheatre & Tech Lounge',
        250,
        250,
        true,
        true,
        dept_ca,
        'Computer Applications',
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%prarambh%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, department_id, department_name, created_by, created_at, updated_at)
      VALUES (
        'Prarambh 2025: Management Social',
        'Formal business induction and icebreaker social for incoming MBA & BBA cohorts at MET Institute of Management.',
        'cultural',
        'Department Freshers',
        NOW() + INTERVAL '4 days',
        NOW() + INTERVAL '4 days 6 hours',
        'MET Banquet Hall',
        300,
        300,
        true,
        true,
        dept_mgmt,
        'Management',
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM events WHERE LOWER(title) LIKE '%pharmafiesta%') THEN
      INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, max_participants, is_published, is_freshers, department_id, department_name, created_by, created_at, updated_at)
      VALUES (
        'PharmaFiesta 2025: Pharmacy Orientation',
        'Orientation gathering, white coat ceremony, and campus tour for B.Pharm and M.Pharm freshers batch.',
        'cultural',
        'Department Freshers',
        NOW() + INTERVAL '5 days',
        NOW() + INTERVAL '5 days 6 hours',
        'Pharmacy Quadrangle',
        200,
        200,
        true,
        true,
        dept_pharm,
        'Pharmacy',
        admin_uid,
        NOW(),
        NOW()
      );
    END IF;
  END IF;
END $$;
