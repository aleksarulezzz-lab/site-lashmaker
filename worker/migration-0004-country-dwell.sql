-- Country of each visit (from Cloudflare's CF-IPCountry header) and how long
-- the visit lasted (dwell_ms, filled in by a follow-up beacon on page unload,
-- matched to its load row by the client-generated view_id).
ALTER TABLE page_views ADD COLUMN country TEXT;
ALTER TABLE page_views ADD COLUMN view_id TEXT;
ALTER TABLE page_views ADD COLUMN dwell_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_page_views_view_id ON page_views(view_id);
