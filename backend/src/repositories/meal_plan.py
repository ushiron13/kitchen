import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.meal_plan import Meal, MealPlan
from src.schemas.meal_plan import MealPlanCreate


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class MealPlanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_from_skeleton(
        self,
        data: MealPlanCreate,
        meals_data: list[dict],
    ) -> MealPlan:
        now = _now()
        start = datetime.strptime(data.start_date, "%Y-%m-%d")
        end = start + timedelta(days=data.days - 1)
        plan = MealPlan(
            start_date=data.start_date,
            end_date=end.strftime("%Y-%m-%d"),
            status="draft",
            notes=data.preferences,  # preferences → DB の notes カラムに保存
            created_at=now,
            updated_at=now,
        )
        self.session.add(plan)
        await self.session.flush()

        for m in meals_data:
            ingr_raw = m.get("estimated_ingredients", [])
            meal = Meal(
                meal_plan_id=plan.id,
                served_date=m["served_date"],
                meal_type=m["meal_type"],
                status="planned",
                concept=m.get("concept"),
                estimated_ingredients=json.dumps(ingr_raw, ensure_ascii=False),
                cook_time_min_estimate=m.get("cook_time_min_estimate"),
                created_at=now,
                updated_at=now,
            )
            self.session.add(meal)

        await self.session.flush()
        return await self.get(plan.id)

    async def get(self, plan_id: int) -> Optional[MealPlan]:
        stmt = (
            select(MealPlan)
            .where(MealPlan.id == plan_id)
            .options(selectinload(MealPlan.meals))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(self) -> list[MealPlan]:
        stmt = (
            select(MealPlan)
            .options(selectinload(MealPlan.meals))
            .order_by(MealPlan.start_date.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_meal(self, meal_id: int) -> Optional[Meal]:
        stmt = select(Meal).where(Meal.id == meal_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def attach_recipe(self, meal_id: int, recipe_id: int) -> Optional[Meal]:
        meal = await self.session.get(Meal, meal_id)
        if meal is None:
            return None
        meal.recipe_id = recipe_id
        meal.updated_at = _now()
        await self.session.flush()
        return meal
