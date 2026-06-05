from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
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
