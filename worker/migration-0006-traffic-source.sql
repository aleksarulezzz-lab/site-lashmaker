-- Where each visit came from: utm_source if present, else the referring
-- hostname, else 'direct'. Computed client-side and sent with the load beacon.
ALTER TABLE page_views ADD COLUMN source TEXT;

CREATE INDEX IF NOT EXISTS idx_page_views_source ON page_views(source);

INSERT OR IGNORE INTO schema_migrations (name) VALUES ('migration-0006-traffic-source');
