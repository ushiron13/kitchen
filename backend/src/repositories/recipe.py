from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.recipe import Recipe, RecipeIngredient


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class RecipeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_from_llm(self, recipe_data: dict) -> Recipe:
        now = _now()
        recipe = Recipe(
            name=recipe_data["name"],
            instructions_md=recipe_data["instructions_md"],
            cook_time_min=recipe_data.get("cook_time_min"),
            cost_estimate=recipe_data.get("cost_estimate"),
            source="llm",
            created_at=now,
            updated_at=now,
        )
        self.session.add(recipe)
        await self.session.flush()

        for ingr in recipe_data.get("ingredients", []):
            ingredient = RecipeIngredient(
                recipe_id=recipe.id,
                raw_name=ingr.get("raw_name"),
                quantity=ingr.get("quantity"),
                unit=ingr.get("unit"),
                is_main=1 if ingr.get("is_main") else 0,
            )
            self.session.add(ingredient)

        await self.session.flush()
        return await self.get(recipe.id)

    async def get(self, recipe_id: int) -> Optional[Recipe]:
        stmt = (
            select(Recipe)
            .where(Recipe.id == recipe_id)
            .options(selectinload(Recipe.ingredients))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_name(self, name: str) -> Optional[Recipe]:
        """同名レシピを検索（DB再利用 F-RECIPE-02）。"""
        stmt = (
            select(Recipe)
            .where(func.lower(Recipe.name) == name.lower())
            .where(Recipe.is_archived == 0)
            .options(selectinload(Recipe.ingredients))
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def increment_reuse(self, recipe_id: int) -> None:
        recipe = await self.session.get(Recipe, recipe_id)
        if recipe:
            recipe.reuse_count += 1
            recipe.updated_at = _now()
            await self.session.flush()

    async def list_all(
        self,
        q: Optional[str] = None,
        food_name: Optional[str] = None,
    ) -> list[Recipe]:
        """レシピ一覧。q=名前部分一致、food_name=食材名部分一致（F-RECIPE-03）。"""
        stmt = (
            select(Recipe)
            .where(Recipe.is_archived == 0)
            .options(selectinload(Recipe.ingredients))
        )
        if q:
            stmt = stmt.where(Recipe.name.ilike(f"%{q}%"))
        if food_name:
            stmt = (
                stmt.join(Recipe.ingredients)
                .where(RecipeIngredient.raw_name.ilike(f"%{food_name}%"))
            )
        stmt = stmt.order_by(Recipe.created_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())
