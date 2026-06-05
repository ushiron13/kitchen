import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.meal_agent import build_recipe_graph
from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.meal_plan import MealPlanRepository
from src.repositories.recipe import RecipeRepository
from src.schemas.recipe import RecipeIngredientRead, RecipeRead

router = APIRouter(
    prefix="/meals",
    tags=["Meals"],
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


@router.post("/{meal_id}/recipe", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
async def generate_recipe_for_meal(
    meal_id: int,
    session: AsyncSession = Depends(get_session),
) -> RecipeRead:
    """献立のコンセプトからレシピ詳細をLLMで生成して紐付ける。"""
    meal_repo = MealPlanRepository(session)
    meal = await meal_repo.get_meal(meal_id)
    if meal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found")

    concept = meal.concept or "おまかせ料理"
    ingredients: list[str] = []
    if meal.estimated_ingredients:
        try:
            ingredients = json.loads(meal.estimated_ingredients)
        except Exception:
            pass

    graph = build_recipe_graph()
    result = await graph.ainvoke({
        "concept": concept,
        "estimated_ingredients": ingredients,
        "prompt_text": "",
        "raw_response": "",
        "recipe": None,
        "error": None,
    })

    if result.get("error") or not result.get("recipe"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent error: {result.get('error', 'No recipe generated')}",
        )

    recipe_repo = RecipeRepository(session)
    recipe = await recipe_repo.create_from_llm(result["recipe"])
    await meal_repo.attach_recipe(meal_id, recipe.id)
    await session.commit()
    recipe = await recipe_repo.get(recipe.id)
    return _recipe_to_read(recipe)
