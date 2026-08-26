ALTER TABLE bookings ADD COLUMN confirm_token TEXT;
ALTER TABLE bookings ADD COLUMN client_chat_id INTEGER;
ALTER TABLE bookings ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_confirm_token
  ON bookings(confirm_token)
  WHERE confirm_token IS NOT NULL;
