import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.meal_agent import build_skeleton_graph
from src.core.database import get_session
from src.core.security import verify_api_key
from src.repositories.meal_plan import MealPlanRepository
from src.repositories.stock import StockRepository
from src.schemas.meal_plan import MealPlanCreate, MealPlanRead, MealRead
from src.schemas.shopping_list import ShoppingItem, ShoppingListRead

router = APIRouter(
    prefix="/meal-plans",
    tags=["MealPlans"],
    dependencies=[Depends(verify_api_key)],
)


def _meal_to_read(meal) -> MealRead:
    ingr: list[str] = []
    if meal.estimated_ingredients:
        try:
            ingr = json.loads(meal.estimated_ingredients)
        except Exception:
            pass
    return MealRead(
        id=meal.id,
        meal_plan_id=meal.meal_plan_id,
        recipe_id=meal.recipe_id,
        served_date=meal.served_date,
        meal_type=meal.meal_type,
        status=meal.status,
        concept=meal.concept,
        estimated_ingredients=ingr,
        cook_time_min_estimate=meal.cook_time_min_estimate,
        notes=meal.notes,
        created_at=meal.created_at,
        updated_at=meal.updated_at,
    )


def _plan_to_read(plan) -> MealPlanRead:
    return MealPlanRead(
        id=plan.id,
        start_date=plan.start_date,
        end_date=plan.end_date,
        status=plan.status,
        notes=plan.notes,
        meals=[_meal_to_read(m) for m in plan.meals],
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


@router.post("", response_model=MealPlanRead, status_code=status.HTTP_201_CREATED)
async def create_meal_plan(
    data: MealPlanCreate,
    session: AsyncSession = Depends(get_session),
) -> MealPlanRead:
    """在庫を参照してLLMで献立スケルトンを生成し保存する。"""
    stock_repo = StockRepository(session)
    items = await stock_repo.list()

    if items:
        stock_summary = "\n".join(
            f"- {i.food.name}: {i.quantity}{i.unit}"
            + (f"（期限: {i.expiry_date}）" if i.expiry_date else "")
            for i in items
        )
    else:
        stock_summary = "（在庫なし）"

    graph = build_skeleton_graph()
    result = await graph.ainvoke({
        "stock_summary": stock_summary,
        "start_date": data.start_date,
        "days": data.days,
        "meal_types": list(data.meal_types),
        "preferences": data.preferences or "",
        "prompt_text": "",
        "raw_response": "",
        "meals": [],
        "error": None,
    })

    if result.get("error"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent error: {result['error']}",
        )

    repo = MealPlanRepository(session)
    plan = await repo.create_from_skeleton(data, result["meals"])
    await session.commit()
    return _plan_to_read(plan)


@router.get("", response_model=list[MealPlanRead])
async def list_meal_plans(
    session: AsyncSession = Depends(get_session),
) -> list[MealPlanRead]:
    repo = MealPlanRepository(session)
    plans = await repo.list()
    return [_plan_to_read(p) for p in plans]


@router.get("/{plan_id}", response_model=MealPlanRead)
async def get_meal_plan(
    plan_id: int,
    session: AsyncSession = Depends(get_session),
) -> MealPlanRead:
    repo = MealPlanRepository(session)
    plan = await repo.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal plan not found")
    return _plan_to_read(plan)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal_plan(
    plan_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    repo = MealPlanRepository(session)
    deleted = await repo.delete(plan_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal plan not found")
    await session.commit()


@router.get("/{plan_id}/shopping-list", response_model=ShoppingListRead)
async def get_shopping_list(
    plan_id: int,
    session: AsyncSession = Depends(get_session),
) -> ShoppingListRead:
    """献立プランの推定食材と在庫を照合して買い物リストを返す（F-MEAL-08）。"""
    repo = MealPlanRepository(session)
    plan = await repo.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal plan not found")

    ingredient_names = await repo.get_ingredient_names(plan_id)

    stock_repo = StockRepository(session)
    stock_items = await stock_repo.list()
    stock_map: dict[str, tuple[float, str]] = {}
    for item in stock_items:
        key = item.food.name.lower()
        if key not in stock_map:
            stock_map[key] = (item.quantity, item.unit)

    items = []
    for name in ingredient_names:
        key = name.lower()
        if key in stock_map:
            qty, unit = stock_map[key]
            items.append(ShoppingItem(name=name, in_stock=qty > 0, stock_quantity=qty, stock_unit=unit))
        else:
            items.append(ShoppingItem(name=name, in_stock=False))

    return ShoppingListRead(meal_plan_id=plan_id, items=items)
