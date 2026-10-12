/**
 * Campus Inn+ — Database Migration: Initial Schema
 * Creates all tables, indexes, and constraints for the entire application.
 *
 * Run: npm run migrate
 *
 * SAFETY: Uses IF NOT EXISTS — safe to re-run.
 * NEVER drops or truncates existing tables.
 */
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
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

async function runMigration() {
  const client = await pool.connect();
  try {
    // Check if this migration has already been applied
    await client.query(\`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )\`);

    const migrationName = '001_initial_schema';
    const existing = await client.query(
      'SELECT id FROM _migrations WHERE name = $1',
      [migrationName]
    );

    if (existing.rows.length > 0) {
      console.log(\`[Migration] \${migrationName} already applied — skipping.\`);
      return;
    }

    console.log('[Migration] Applying 001_initial_schema...');
    await client.query('BEGIN');
    await client.query(MIGRATION_SQL);
    await client.query(
      'INSERT INTO _migrations (name) VALUES ($1)',
      [migrationName]
    );
    await client.query('COMMIT');
    console.log('[Migration] 001_initial_schema applied successfully.');
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
    .then(() => {
      console.log('[Migration] Complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
