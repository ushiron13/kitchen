from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.profile import UserProfile
from src.schemas.profile import ProfileUpdate


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


class ProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self) -> UserProfile | None:
        """プロファイルを取得する。存在しない場合は None を返す（副作用なし）。"""
        result = await self.session.execute(select(UserProfile).where(UserProfile.id == 1))
        return result.scalar_one_or_none()

    async def upsert(self, data: ProfileUpdate) -> UserProfile:
        """プロファイルを更新する。行が存在しない場合は新規作成する。"""
        profile = await self.get()
        if profile is None:
            profile = UserProfile(id=1, updated_at=_now())
            self.session.add(profile)
            await self.session.flush()
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        profile.updated_at = _now()
        await self.session.flush()
        return profile
