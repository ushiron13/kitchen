from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.meal_agent import build_recipe_graph
from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.recipe import RecipeRepository
from src.schemas.recipe import RecipeIngredientRead, RecipeRead, RecipeSuggestRequest

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


@router.get("", response_model=list[RecipeRead])
async def list_recipes(
    q: str | None = None,
    food_name: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[RecipeRead]:
    """レシピ一覧検索（F-RECIPE-03）。q=名前、food_name=食材名で部分一致フィルタ。"""
    repo = RecipeRepository(session)
    recipes = await repo.list_all(q=q, food_name=food_name)
    return [_recipe_to_read(r) for r in recipes]


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


@router.post("/suggest", response_model=list[RecipeRead], status_code=status.HTTP_201_CREATED)
async def suggest_recipes(
    data: RecipeSuggestRequest,
    session: AsyncSession = Depends(get_session),
) -> list[RecipeRead]:
    """指定食材からレシピを1〜3案生成する（F-MEAL-11）。"""
    repo = RecipeRepository(session)
    results: list[RecipeRead] = []

    for i in range(data.count):
        foods_str = "・".join(data.food_names)
        concept = foods_str if i == 0 else f"{foods_str} アレンジ{i}"

        graph = build_recipe_graph()
        result = await graph.ainvoke(
            {
                "concept": concept,
                "estimated_ingredients": data.food_names,
                "prompt_text": "",
                "raw_response": "",
                "recipe": None,
                "error": None,
            }
        )
        if result.get("error") or not result.get("recipe"):
            continue

        recipe = await repo.create_from_llm(result["recipe"])
        results.append(_recipe_to_read(recipe))

    await session.commit()
    if not results:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="レシピ生成に失敗しました",
        )
    return results
