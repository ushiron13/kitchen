import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.core import database as db_module
from src.core.config import settings
from src.models.base import Base

TEST_API_KEY = "test-api-key"

# テスト用インメモリ SQLite エンジン
_test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
)
_test_session_factory = async_sessionmaker(_test_engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
def patch_settings(monkeypatch):
    """テスト用に API キーと DB をインメモリに差し替え"""
    monkeypatch.setattr(settings, "kitchen_api_key", TEST_API_KEY)
    monkeypatch.setattr(db_module, "engine", _test_engine)
    monkeypatch.setattr(db_module, "async_session", _test_session_factory)


@pytest.fixture(autouse=True)
async def setup_db():
    """テストごとにスキーマを再作成してクリーンな状態を保証"""
    from sqlalchemy import text
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("PRAGMA foreign_keys = ON"))
        await conn.execute(text("PRAGMA journal_mode = WAL"))
        # Alembic migration で定義されているトリガー（metadata に含まれないため手動で作成）
        await conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_stock_quantity_auto_update
            AFTER INSERT ON stock_transaction
            BEGIN
                UPDATE stock_item
                SET quantity = quantity + NEW.quantity_delta,
                    updated_at = datetime('now')
                WHERE id = NEW.stock_item_id;
            END
        """))
    yield
