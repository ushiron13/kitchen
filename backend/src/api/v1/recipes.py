from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.recipe import RecipeRepository
from src.schemas.recipe import RecipeIngredientRead, RecipeRead

router = APIRouter(
    prefix="/recipes",
    tags=["Recipes"],
    dependencies=[Depends(verify_api_key)],
)


def _recipe_to_read(recipe) -> RecipeRead:
    return RecipeRead(
        id=recipe.id,
        name=recipe.name,
        instructions_md=recipe.instructions_md,
        cook_time_min=recipe.cook_time_min,
        cost_estimate=recipe.cost_estimate,
        is_favorite=bool(recipe.is_favorite),
        reuse_count=recipe.reuse_count,
        ingredients=[
            RecipeIngredientRead(
                id=i.id,
                food_id=i.food_id,
                raw_name=i.raw_name,
                quantity=i.quantity,
                unit=i.unit,
                is_main=bool(i.is_main),
                notes=i.notes,
            )
            for i in recipe.ingredients
        ],
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


@router.get("/{recipe_id}", response_model=RecipeRead)
async def get_recipe(
    recipe_id: int,
    session: AsyncSession = Depends(get_session),
) -> RecipeRead:
    repo = RecipeRepository(session)
    recipe = await repo.get(recipe_id)
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return _recipe_to_read(recipe)
