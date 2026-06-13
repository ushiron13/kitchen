"""add user_profile table

Revision ID: 004
Revises: 003
Create Date: 2026-06-14

F-05: ユーザープロファイル（家族構成・食事傾向・アレルギー）を保存する単一行テーブル。
献立生成時にプロファイルをシステムプロンプトへ自動注入することで、
毎回の preferences 入力なしに固定嗜好を反映する。
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS user_profile (
        id                  INTEGER PRIMARY KEY DEFAULT 1,
        family_composition  TEXT,
        food_preferences    TEXT,
        allergies           TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (id = 1)
    )""")
    op.execute("INSERT OR IGNORE INTO user_profile (id) VALUES (1)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_profile")
