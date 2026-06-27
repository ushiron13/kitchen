"""add meal_feedback table

Revision ID: 002
Revises: 001
Create Date: 2026-06-06

meal_feedback は「提案されたが作られなかった」データを蓄積し、
将来の好み学習（F-08）に使用するためのテーブル。
Phase 2 以降に API/UI を実装予定。
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("PRAGMA foreign_keys = ON;")
    op.execute("""
    CREATE TABLE IF NOT EXISTS meal_feedback (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id     INTEGER NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
        satisfaction INTEGER CHECK(satisfaction BETWEEN 1 AND 5),
        skip_reason TEXT,
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )""")
    op.execute("CREATE INDEX idx_meal_feedback_meal_id ON meal_feedback(meal_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_meal_feedback_meal_id")
    op.execute("DROP TABLE IF EXISTS meal_feedback")
