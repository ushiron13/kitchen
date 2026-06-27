from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.core.security import verify_api_key
from src.models.stock import StockItem
from src.repositories.food import FoodRepository
from src.schemas.food import FoodCreate, FoodRead, FoodUpdate

router = APIRouter(
    prefix="/foods",
    tags=["Foods"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("", response_model=FoodRead, status_code=status.HTTP_201_CREATED)
async def create_food(
    data: FoodCreate,
    session: AsyncSession = Depends(get_session),
) -> FoodRead:
    repo = FoodRepository(session)
    try:
        food = await repo.create(data)
        await session.commit()
    except IntegrityError as err:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Food name already exists"
        ) from err
    return FoodRead.model_validate(food)


@router.get("", response_model=list[FoodRead])
async def list_foods(
    category: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[FoodRead]:
    repo = FoodRepository(session)
    foods = await repo.list(category=category)
    return [FoodRead.model_validate(f) for f in foods]


@router.get("/{food_id}", response_model=FoodRead)
async def get_food(
    food_id: int,
    session: AsyncSession = Depends(get_session),
) -> FoodRead:
    repo = FoodRepository(session)
    food = await repo.get(food_id)
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    return FoodRead.model_validate(food)


@router.patch("/{food_id}", response_model=FoodRead)
async def update_food(
    food_id: int,
    data: FoodUpdate,
    session: AsyncSession = Depends(get_session),
) -> FoodRead:
    repo = FoodRepository(session)
    food = await repo.update(food_id, data)
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    await session.commit()
    return FoodRead.model_validate(food)


@router.delete("/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_food(
    food_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    repo = FoodRepository(session)
    food = await repo.get(food_id)
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    ref = await session.execute(select(StockItem.id).where(StockItem.food_id == food_id).limit(1))
    if ref.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="在庫がある食材は削除できません。先に在庫を削除してください。",
        )
    await repo.delete(food_id)
    await session.commit()
