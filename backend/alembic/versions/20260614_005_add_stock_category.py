"""add category to stock_item

Revision ID: 005
Revises: 004
Create Date: 2026-06-14

F-10: 在庫ごとの保管場所（カテゴリ）上書き。
stock_item.category が NULL の場合は food_master.category を参照する。
これにより「豚肉（冷蔵）」と「豚肉（冷凍）」のように
同一食材を異なる保管場所で在庫管理できる。
"""
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE stock_item ADD COLUMN category TEXT "
        "CHECK(category IS NULL OR category IN "
        "('refrigerated','frozen','pantry','ambient','seasoning'))"
    )


def downgrade() -> None:
    pass
