from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.profile import UserProfile
from src.schemas.profile import ProfileUpdate


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class ProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self) -> UserProfile:
        result = await self.session.execute(select(UserProfile).where(UserProfile.id == 1))
        profile = result.scalar_one_or_none()
        if profile is None:
            profile = UserProfile(id=1, updated_at=_now())
            self.session.add(profile)
            await self.session.flush()
        return profile

    async def update(self, data: ProfileUpdate) -> UserProfile:
        profile = await self.get()
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        profile.updated_at = _now()
        await self.session.flush()
        return profile
