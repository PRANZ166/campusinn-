-- ====================================================================
-- Migration 010: Event Type Enum & Historical Date Support
-- Campus Inn+ (Connect. Manage. Grow.)
--
-- 1. Ensure 'tag' column exists on events for category labels (e.g. 'Department Freshers')
-- 2. Safely add 'department_freshers' to event_type enum if supported
-- 3. Ensure 'event_type' column exists as varchar fallback
-- 4. Create performance indexes on events(tag) and events(date_start)
-- ====================================================================

-- 1. Add tag column if not present
ALTER TABLE events ADD COLUMN IF NOT EXISTS tag VARCHAR(100);

-- 2. Add department_freshers enum value if not already registered
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
      -- If inside transaction block where ALTER TYPE ADD VALUE cannot run
      NULL;
    END;
  END IF;
END $$;

-- 3. Ensure event_type varchar column exists
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'other';

-- 4. Index tag and date_start for fast calendar queries and historical audits
CREATE INDEX IF NOT EXISTS idx_events_tag ON events(tag);
CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(date_start DESC);
