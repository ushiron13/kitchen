import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.meal_agent import build_recipe_graph
from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.meal_plan import MealPlanRepository
from src.repositories.recipe import RecipeRepository
from src.schemas.meal_plan import MealStatusUpdate
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


@router.patch("/{meal_id}/status", status_code=status.HTTP_204_NO_CONTENT)
async def update_meal_status(
    meal_id: int,
    data: MealStatusUpdate,
    session: AsyncSession = Depends(get_session),
) -> None:
    repo = MealPlanRepository(session)
    meal = await repo.update_meal_status(meal_id, data.status)
    if meal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found")
    await session.commit()


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal(
    meal_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    repo = MealPlanRepository(session)
    deleted = await repo.delete_meal(meal_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found")
    await session.commit()


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

    recipe_repo = RecipeRepository(session)

    # F-RECIPE-02: 同名レシピが既にあれば再利用してLLMコストを節約
    existing = await recipe_repo.find_by_name(concept)
    if existing:
        # 別の meal への初回アタッチ時のみ reuse_count を増やす
        # すでにこの meal に紐づいている場合（再表示など）はカウントしない
        if meal.recipe_id != existing.id:
            await recipe_repo.increment_reuse(existing.id)
            await meal_repo.attach_recipe(meal_id, existing.id)
            await session.commit()
        recipe = await recipe_repo.get(existing.id)
        return _recipe_to_read(recipe)

    graph = build_recipe_graph()
    result = await graph.ainvoke(
        {
            "concept": concept,
            "estimated_ingredients": ingredients,
            "prompt_text": "",
            "raw_response": "",
            "recipe": None,
            "error": None,
        }
    )

    if result.get("error") or not result.get("recipe"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent error: {result.get('error', 'No recipe generated')}",
        )

    recipe = await recipe_repo.create_from_llm(result["recipe"])
    await meal_repo.attach_recipe(meal_id, recipe.id)
    await session.commit()
    recipe = await recipe_repo.get(recipe.id)
    return _recipe_to_read(recipe)
