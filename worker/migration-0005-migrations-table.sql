-- Track which migrations have been applied. Backfills the ones that were run
-- by hand before this table existed.
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (name) VALUES
  ('migration-0002-reminders'),
  ('migration-0003-page-views'),
  ('migration-0004-country-dwell'),
  ('migration-0005-migrations-table');
