-- ══════════════════════════════════════════════════════════
-- Migration 011: Event Banner Binary Persistence & Published Timestamp
-- Campus Inn+ (Connect. Manage. Grow.)
--
-- 1. Adds persistent PostgreSQL binary storage for event banners (survives Render restarts)
-- 2. Adds banner metadata (mime_type, filename, size, URL reference)
-- 3. Adds published_at timestamp to order newest published events first
-- 4. Creates performance index on published_at DESC NULLS LAST, created_at DESC
-- ══════════════════════════════════════════════════════════

-- 1. Banner columns
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_data BYTEA;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_mime_type VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_filename VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_size INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Publication timestamp
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Backfill published_at for existing published events
UPDATE events
SET published_at = COALESCE(created_at, NOW())
WHERE is_published = true AND published_at IS NULL;

-- 4. Performance index for newest published event feed
CREATE INDEX IF NOT EXISTS idx_events_published_at ON events (published_at DESC NULLS LAST, created_at DESC);
