"""Private Steam history connection and manual sync state."""
from backend.config.database import execute_script

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade():
    execute_script("""
    CREATE TABLE steam_match_sync (
      account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      auth_cipher TEXT NOT NULL,
      cursor_code TEXT NOT NULL,
      seed_pending BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'idle',
      message TEXT,
      imported INTEGER NOT NULL DEFAULT 0,
      job_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_sync_at TIMESTAMPTZ
      ,last_attempt_at TIMESTAMPTZ
    );
    """)


def downgrade():
    execute_script("DROP TABLE steam_match_sync;")
