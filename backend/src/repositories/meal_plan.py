from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.meal_plan import Meal, MealPlan
from src.schemas.meal_plan import MealPlanCreate


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


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
        result = await self.get(plan.id)
        assert result is not None
        return result

    async def get(self, plan_id: int) -> MealPlan | None:
        stmt = select(MealPlan).where(MealPlan.id == plan_id).options(selectinload(MealPlan.meals))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self) -> list[MealPlan]:
        stmt = (
            select(MealPlan)
            .options(selectinload(MealPlan.meals))
            .order_by(MealPlan.start_date.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_meal(self, meal_id: int) -> Meal | None:
        stmt = select(Meal).where(Meal.id == meal_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def attach_recipe(self, meal_id: int, recipe_id: int) -> Meal | None:
        meal = await self.session.get(Meal, meal_id)
        if meal is None:
            return None
        meal.recipe_id = recipe_id
        meal.updated_at = _now()
        await self.session.flush()
        return meal

    async def update_meal_status(self, meal_id: int, new_status: str) -> Meal | None:
        meal = await self.session.get(Meal, meal_id)
        if meal is None:
            return None
        meal.status = new_status
        meal.updated_at = _now()
        await self.session.flush()
        return meal

    async def delete(self, plan_id: int) -> bool:
        plan = await self.session.get(MealPlan, plan_id)
        if plan is None:
            return False
        await self.session.delete(plan)
        await self.session.flush()
        return True

    async def delete_meal(self, meal_id: int) -> bool:
        meal = await self.session.get(Meal, meal_id)
        if meal is None:
            return False
        await self.session.delete(meal)
        await self.session.flush()
        return True

    async def get_ingredient_names(self, plan_id: int) -> list[str]:
        plan = await self.get(plan_id)
        if plan is None:
            return []
        names: set[str] = set()
        for meal in plan.meals:
            if meal.estimated_ingredients:
                try:
                    for n in json.loads(meal.estimated_ingredients):
                        if n and str(n).strip():
                            names.add(str(n).strip())
                except Exception:
                    pass
        return sorted(names)
