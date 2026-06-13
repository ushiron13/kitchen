from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.profile import ProfileRepository
from src.schemas.profile import ProfileRead, ProfileUpdate

router = APIRouter(
    prefix="/profile",
    tags=["Profile"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("", response_model=ProfileRead)
async def get_profile(
    session: AsyncSession = Depends(get_session),
) -> ProfileRead:
    repo = ProfileRepository(session)
    profile = await repo.get()
    return ProfileRead.model_validate(profile)


@router.put("", response_model=ProfileRead)
async def update_profile(
    data: ProfileUpdate,
    session: AsyncSession = Depends(get_session),
) -> ProfileRead:
    repo = ProfileRepository(session)
    profile = await repo.update(data)
    await session.commit()
    return ProfileRead.model_validate(profile)
