from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from src.core.config import settings

DATABASE_URL = f"sqlite+aiosqlite:///{settings.db_path}"

engine = create_async_engine(
    DATABASE_URL,
    echo=(settings.log_level == "DEBUG"),
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    """起動時の DB 確認（マイグレーションは alembic で別途実行）"""
    async with engine.connect() as conn:
        await conn.execute(text("PRAGMA foreign_keys = ON"))
        await conn.execute(text("PRAGMA journal_mode = WAL"))


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
