"""Store utility inventory for replay snapshots."""
from backend.config.database import execute_script

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    execute_script("ALTER TABLE player_positions ADD COLUMN IF NOT EXISTS utility_inventory TEXT[];")


def downgrade() -> None:
    execute_script("ALTER TABLE player_positions DROP COLUMN IF EXISTS utility_inventory;")
