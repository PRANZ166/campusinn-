/**
 * Campus Inn+ — Database Migration: Initial Schema
 * Creates all tables, indexes, and constraints for the entire application.
 *
 * Run: npm run migrate
 *
 * SAFETY: Uses IF NOT EXISTS — safe to re-run.
 * NEVER drops or truncates existing tables.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATION_SQL = `
-- ══════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════
-- 2. ENUM TYPES
-- ══════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'faculty', 'admin', 'tpo', 'coordinator', 'recruiter');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'suspended', 'deactivated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'interview_slotted', 'offer_extended', 'offer_accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('hackathon', 'cultural', 'technical', 'workshop', 'seminar', 'sports', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE noc_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE team_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE epass_status AS ENUM ('valid', 'used', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE drive_status AS ENUM ('draft', 'open', 'closed', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hiring_req_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════
-- 3. USERS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'student',
  status        account_status NOT NULL DEFAULT 'active',
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  google_id     VARCHAR(255),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════
-- 4. STUDENT PROFILES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS student_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roll_number     VARCHAR(50) NOT NULL,
  college         VARCHAR(255) NOT NULL,
  department      VARCHAR(150) NOT NULL,
  program         VARCHAR(100) NOT NULL,
  academic_year   VARCHAR(50) NOT NULL,
  semester        VARCHAR(20) NOT NULL,
  cgpa            DECIMAL(4,2),
  backlogs        INTEGER DEFAULT 0,
  role_label      VARCHAR(150),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_roll ON student_profiles (UPPER(roll_number));
CREATE INDEX IF NOT EXISTS idx_student_profiles_dept ON student_profiles (department);

-- ══════════════════════════════════════════════════════════
-- 5. FACULTY PROFILES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS faculty_profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college       VARCHAR(255) NOT NULL,
  department    VARCHAR(150) NOT NULL,
  designation   VARCHAR(150),
  role_label    VARCHAR(150),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_user ON faculty_profiles (user_id);

-- ══════════════════════════════════════════════════════════
-- 6. MENTORSHIP (Faculty <-> Student)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mentorships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  noc_status    noc_status NOT NULL DEFAULT 'pending',
  noc_granted_at TIMESTAMPTZ,
  noc_granted_by UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(faculty_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_mentorships_faculty ON mentorships (faculty_id);
CREATE INDEX IF NOT EXISTS idx_mentorships_student ON mentorships (student_id);

-- ══════════════════════════════════════════════════════════
-- 7. DEPARTMENTS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS departments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(150) NOT NULL,
  college       VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, college)
);

-- ══════════════════════════════════════════════════════════
-- 8. COURSES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS courses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(30) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  department_id   UUID REFERENCES departments(id),
  semester        VARCHAR(20),
  credits         INTEGER,
  faculty_id      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code)
);

CREATE INDEX IF NOT EXISTS idx_courses_dept ON courses (department_id);
CREATE INDEX IF NOT EXISTS idx_courses_faculty ON courses (faculty_id);

-- ══════════════════════════════════════════════════════════
-- 9. ATTENDANCE
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  conducted_by  UUID NOT NULL REFERENCES users(id),
  session_date  DATE NOT NULL,
  topic         VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, session_date, conducted_by)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        attendance_status NOT NULL DEFAULT 'absent',
  marked_by     UUID NOT NULL REFERENCES users(id),
  marked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records (session_id);

-- ══════════════════════════════════════════════════════════
-- 10. EVENTS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  category        event_type NOT NULL DEFAULT 'other',
  tag             VARCHAR(100),
  date_start      TIMESTAMPTZ,
  date_end        TIMESTAMPTZ,
  venue           VARCHAR(300),
  capacity        INTEGER,
  department_id   UUID REFERENCES departments(id),
  is_published    BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_category ON events (category);
CREATE INDEX IF NOT EXISTS idx_events_published ON events (is_published, date_start);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events (created_by);

-- ══════════════════════════════════════════════════════════
-- 11. EVENT REGISTRATIONS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_registrations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at  TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reg_user ON event_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_event ON event_registrations (event_id);

-- ══════════════════════════════════════════════════════════
-- 12. EVENT PROPOSALS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_proposals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(300) NOT NULL,
  description   TEXT,
  category      event_type NOT NULL DEFAULT 'other',
  proposed_date VARCHAR(100),
  venue         VARCHAR(300),
  proposed_by   UUID NOT NULL REFERENCES users(id),
  status        verification_status NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- 13. HACKATHON TEAMS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hackathon_teams (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,
  name          VARCHAR(100) NOT NULL,
  track         VARCHAR(150),
  problem_statement TEXT,
  join_code     VARCHAR(20) NOT NULL,
  lead_id       UUID NOT NULL REFERENCES users(id),
  max_size      INTEGER NOT NULL DEFAULT 4,
  status        team_status NOT NULL DEFAULT 'pending',
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hackathon_teams_join_code ON hackathon_teams (join_code);
CREATE INDEX IF NOT EXISTS idx_hackathon_teams_event ON hackathon_teams (event_id);
CREATE INDEX IF NOT EXISTS idx_hackathon_teams_lead ON hackathon_teams (lead_id);

-- ══════════════════════════════════════════════════════════
-- 14. TEAM MEMBERSHIPS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS team_memberships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id       UUID NOT NULL REFERENCES hackathon_teams(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Prevent a user from joining multiple teams for the same event
CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships (user_id);

-- ══════════════════════════════════════════════════════════
-- 15. E-PASSES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS epasses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pass_code       VARCHAR(64) NOT NULL,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  status          epass_status NOT NULL DEFAULT 'valid',
  validated_at    TIMESTAMPTZ,
  validated_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pass_code)
);

CREATE INDEX IF NOT EXISTS idx_epasses_user ON epasses (user_id);
CREATE INDEX IF NOT EXISTS idx_epasses_event ON epasses (event_id);

-- ══════════════════════════════════════════════════════════
-- 16. COMPANIES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS companies (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(300) NOT NULL,
  cin                 VARCHAR(50),
  gstin               VARCHAR(30),
  website             VARCHAR(500),
  industry            VARCHAR(150),
  headquarters        VARCHAR(200),
  description         TEXT,
  contact_email       VARCHAR(255),
  contact_phone       VARCHAR(30),
  verification_status verification_status NOT NULL DEFAULT 'pending',
  verified_by         UUID REFERENCES users(id),
  verified_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (verification_status);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON companies (created_by);

-- ══════════════════════════════════════════════════════════
-- 17. COMPANY USER ASSOCIATION
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS company_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

-- ══════════════════════════════════════════════════════════
-- 18. PLACEMENT DRIVES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS placement_drives (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(300) NOT NULL,
  role_title        VARCHAR(200),
  ctc               VARCHAR(100),
  location          VARCHAR(200),
  tier              VARCHAR(50),
  eligible_programs TEXT[],
  min_cgpa          DECIMAL(4,2),
  description       TEXT,
  deadline          TIMESTAMPTZ,
  status            drive_status NOT NULL DEFAULT 'draft',
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drives_company ON placement_drives (company_id);
CREATE INDEX IF NOT EXISTS idx_drives_status ON placement_drives (status);
CREATE INDEX IF NOT EXISTS idx_drives_deadline ON placement_drives (deadline);

-- ══════════════════════════════════════════════════════════
-- 19. JOB APPLICATIONS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_applications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drive_id        UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cv_id           UUID,
  status          application_status NOT NULL DEFAULT 'applied',
  current_step    INTEGER NOT NULL DEFAULT 1,
  total_steps     INTEGER NOT NULL DEFAULT 4,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(drive_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_student ON job_applications (student_id);
CREATE INDEX IF NOT EXISTS idx_applications_drive ON job_applications (drive_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON job_applications (status);

-- ══════════════════════════════════════════════════════════
-- 20. CV / DOCUMENT METADATA
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cv_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name   VARCHAR(300) NOT NULL,
  storage_key     VARCHAR(500) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  file_size       BIGINT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_user ON cv_documents (user_id);

-- ══════════════════════════════════════════════════════════
-- 21. HIRING REQUIREMENTS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hiring_requirements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  positions       INTEGER NOT NULL DEFAULT 1,
  min_cgpa        DECIMAL(4,2),
  eligible_depts  TEXT[],
  skills_required TEXT[],
  ctc_range       VARCHAR(100),
  location        VARCHAR(200),
  status          hiring_req_status NOT NULL DEFAULT 'draft',
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hiring_reqs_company ON hiring_requirements (company_id);

-- ══════════════════════════════════════════════════════════
-- 22. INTERVIEW SCHEDULES
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS interview_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id  UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  venue           VARCHAR(300),
  round_number    INTEGER NOT NULL DEFAULT 1,
  round_name      VARCHAR(100),
  interviewer_notes TEXT,
  result          VARCHAR(50),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_app ON interview_schedules (application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_date ON interview_schedules (scheduled_at);

-- ══════════════════════════════════════════════════════════
-- 23. OFFERS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS offers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id  UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  ctc             VARCHAR(100),
  position        VARCHAR(200),
  location        VARCHAR(200),
  joining_date    DATE,
  status          VARCHAR(50) NOT NULL DEFAULT 'extended',
  extended_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_offers_app ON offers (application_id);

-- ══════════════════════════════════════════════════════════
-- 24. USER SETTINGS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme           VARCHAR(10) NOT NULL DEFAULT 'light',
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  sms_notifications   BOOLEAN NOT NULL DEFAULT false,
  placement_alerts    BOOLEAN NOT NULL DEFAULT true,
  event_reminders     BOOLEAN NOT NULL DEFAULT true,
  preferences     JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ══════════════════════════════════════════════════════════
-- 25. NOTIFICATIONS
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(300) NOT NULL,
  message       TEXT,
  type          VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read       BOOLEAN NOT NULL DEFAULT false,
  link          VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

-- ══════════════════════════════════════════════════════════
-- 26. AUDIT LOG
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(100),
  entity_id     UUID,
  details       JSONB,
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);

-- ══════════════════════════════════════════════════════════
-- 27. MIGRATIONS TRACKING
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS _migrations (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name)
);
`;

const MIGRATION_002_SQL = `
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens (expires_at);
`;

const MIGRATION_003_SQL = `
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;
`;

const MIGRATION_004_SQL = `
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS designation VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS college VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS role_label VARCHAR(255);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS cabin_number VARCHAR(100);
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS office_hours VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));
`;

const MIGRATION_005_SQL = `
DO $$ BEGIN
  ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
`;

const MIGRATION_006_SQL = `
INSERT INTO departments (name, college)
VALUES 
  ('Computer Engineering', 'MET Institute of Engineering, Nashik'),
  ('Information Technology', 'MET Institute of Engineering, Nashik'),
  ('Computer Applications', 'MET Institute of Technology, Nashik'),
  ('Management', 'MET Institute of Management, Nashik'),
  ('Pharmacy', 'MET Institute of Pharmacy, Nashik')
ON CONFLICT (name, college) DO NOTHING;

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
`;

const MIGRATION_007_SQL = `
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username)) WHERE username IS NOT NULL;
UPDATE users u
SET username = sp.roll_number
FROM student_profiles sp
WHERE sp.user_id = u.id AND u.username IS NULL AND sp.roll_number IS NOT NULL;
UPDATE users u
SET username = fp.employee_id
FROM faculty_profiles fp
WHERE fp.user_id = u.id AND u.username IS NULL AND fp.employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_roll ON student_profiles (UPPER(roll_number));
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profiles_emp_id ON faculty_profiles (LOWER(employee_id)) WHERE employee_id IS NOT NULL;
`;

const MIGRATION_008_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_log (actor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coordinator_profiles_user_id ON coordinator_profiles (user_id);
`;

const MIGRATION_009_SQL = `
DO $$ BEGIN
  ALTER TABLE event_photos ADD COLUMN IF NOT EXISTS image_data BYTEA;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_photos ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE event_photos ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'published';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_status_pub ON events (status, is_published);

CREATE TABLE IF NOT EXISTS mentorship_feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id    VARCHAR(100) NOT NULL,
  student_name  VARCHAR(255),
  student_roll  VARCHAR(100),
  feedback      TEXT NOT NULL,
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentorship_feedback_fac ON mentorship_feedback (faculty_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_feedback_stu ON mentorship_feedback (student_id);
`;

const MIGRATION_010_SQL = `
  ALTER TABLE events ADD COLUMN IF NOT EXISTS tag VARCHAR(100);
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_type typ
      JOIN pg_enum en ON typ.oid = en.enumtypid
      WHERE typ.typname = 'event_type' AND en.enumlabel = 'department_freshers'
    ) THEN
      BEGIN
        ALTER TYPE event_type ADD VALUE 'department_freshers';
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END $$;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'other';
  CREATE INDEX IF NOT EXISTS idx_events_tag ON events(tag);
  CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(date_start DESC);
`;

const MIGRATION_011_SQL = `
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_url TEXT;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_data BYTEA;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_mime_type VARCHAR(100);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_filename VARCHAR(255);
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_size INTEGER;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
  UPDATE events SET published_at = COALESCE(created_at, NOW()) WHERE is_published = true AND published_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_events_published_at ON events (published_at DESC NULLS LAST, created_at DESC);
`;

const MIGRATIONS = [
  {
    name: '001_initial_schema',
    sqlFile: '001_initial_schema.sql',
    fallbackSql: MIGRATION_SQL,
  },
  {
    name: '002_password_reset_tokens',
    sqlFile: '002_password_reset_tokens.sql',
    fallbackSql: MIGRATION_002_SQL,
  },
  {
    name: '003_faculty_identifiers_and_provisioning',
    sqlFile: '003_faculty_identifiers_and_provisioning.sql',
    fallbackSql: MIGRATION_003_SQL,
  },
  {
    name: '004_scalable_faculty_directory',
    sqlFile: '004_scalable_faculty_directory.sql',
    fallbackSql: MIGRATION_004_SQL,
  },
  {
    name: '005_multi_role_onboarding_and_profiles',
    sqlFile: '005_multi_role_onboarding_and_profiles.sql',
    fallbackSql: MIGRATION_005_SQL,
  },
  {
    name: '006_events_freshers_attendance_and_gallery',
    sqlFile: '006_events_freshers_attendance_and_gallery.sql',
    fallbackSql: MIGRATION_006_SQL,
  },
  {
    name: '007_allow_shared_emails_and_account_identifiers',
    sqlFile: '007_allow_shared_emails_and_account_identifiers.sql',
    fallbackSql: MIGRATION_007_SQL,
  },
  {
    name: '008_admin_authorization_and_session_security',
    sqlFile: '008_admin_authorization_and_session_security.sql',
    fallbackSql: MIGRATION_008_SQL,
  },
  {
    name: '009_photo_binary_persistence_and_faculty_feedback',
    sqlFile: '009_photo_binary_persistence_and_faculty_feedback.sql',
    fallbackSql: MIGRATION_009_SQL,
  },
  {
    name: '010_event_type_enum_and_dates',
    sqlFile: '010_event_type_enum_and_dates.sql',
    fallbackSql: MIGRATION_010_SQL,
  },
  {
    name: '011_event_banner_and_published_at',
    sqlFile: '011_event_banner_and_published_at.sql',
    fallbackSql: MIGRATION_011_SQL,
  },
];

async function runMigration() {
  const client = await pool.connect();
  try {
    // Check if _migrations table exists
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    for (const migration of MIGRATIONS) {
      const existing = await client.query(
        'SELECT id FROM _migrations WHERE name = $1',
        [migration.name]
      );

      if (existing.rows.length > 0) {
        console.log(`[Migration] ${migration.name} already applied — skipping.`);
        continue;
      }

      function getSql() {
        const sqlFilePath = path.resolve(__dirname, '../../migrations', migration.sqlFile);
        if (fs.existsSync(sqlFilePath)) {
          try {
            const fileContent = fs.readFileSync(sqlFilePath, 'utf8');
            if (fileContent && fileContent.trim().length > 0) {
              return fileContent;
            }
          } catch (readErr) {
            console.warn(`[Migration] Could not read ${migration.sqlFile} from disk, using embedded:`, readErr.message);
          }
        }
        return migration.fallbackSql;
      }

      console.log(`[Migration] Applying ${migration.name}...`);
      const sqlToRun = getSql();
      await client.query('BEGIN');
      await client.query(sqlToRun);
      await client.query(
        'INSERT INTO _migrations (name) VALUES ($1)',
        [migration.name]
      );
      await client.query('COMMIT');
      console.log(`[Migration] ${migration.name} applied successfully.`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Migration] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly if invoked as script
if (require.main === module) {
  runMigration()
    .then(async () => {
      console.log('[Migration] Complete.');
      await pool.end().catch(() => {});
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Migration] Fatal error:', err.message || err);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { runMigration };
