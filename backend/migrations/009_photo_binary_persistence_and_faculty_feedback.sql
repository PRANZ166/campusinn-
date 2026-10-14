-- ══════════════════════════════════════════════════════════
-- Campus Inn+ — Database Migration: Photo Persistence & Faculty Mentorship
-- Version: 009_photo_binary_persistence_and_faculty_feedback
-- ══════════════════════════════════════════════════════════

-- 1. Enhance event_photos with PostgreSQL binary persistence & download tracking
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

-- 2. Enhance events table with status lifecycle (draft, published, cancelled)
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'published';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_status_pub ON events (status, is_published);

-- 3. Create Mentorship Feedback persistence table
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
