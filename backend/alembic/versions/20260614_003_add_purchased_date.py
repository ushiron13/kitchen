"""add purchased_date to stock_item

Revision ID: 003
Revises: 002
Create Date: 2026-06-14

F-03: 食材の保存日数目安表示のための購入日カラム追加。
purchased_date + food.default_shelf_days で消費目安日を算出できる。
"""
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE stock_item ADD COLUMN purchased_date TEXT")


def downgrade() -> None:
    # SQLite は DROP COLUMN 非対応のため no-op（開発環境想定）
    pass
