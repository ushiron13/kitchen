from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.food import FoodMaster
from src.schemas.food import FoodCreate, FoodUpdate


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


class FoodRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: FoodCreate) -> FoodMaster:
        now = _now()
        food = FoodMaster(
            name=data.name,
            category=data.category,
            default_shelf_days=data.default_shelf_days,
            created_at=now,
            updated_at=now,
        )
        self.session.add(food)
        await self.session.flush()
        await self.session.refresh(food)
        return food

    async def get(self, food_id: int) -> FoodMaster | None:
        result = await self.session.get(FoodMaster, food_id)
        return result

    async def list(self, category: str | None = None) -> list[FoodMaster]:
        stmt = select(FoodMaster).order_by(FoodMaster.name)
        if category:
            stmt = stmt.where(FoodMaster.category == category)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update(self, food_id: int, data: FoodUpdate) -> FoodMaster | None:
        food = await self.get(food_id)
        if food is None:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(food, field, value)
        food.updated_at = _now()
        await self.session.flush()
        await self.session.refresh(food)
        return food

    async def delete(self, food_id: int) -> bool:
        food = await self.get(food_id)
        if food is None:
            return False
        await self.session.delete(food)
        await self.session.flush()
        return True
