from fastapi import APIRouter

from src.api.v1 import health

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
# TODO: 以下を Phase 0b〜0c で順次追加
# from src.api.v1 import foods, inventory, recipes, meal_plans, meals, shopping, family, admin, agent
# api_router.include_router(foods.router)
# ...
