from fastapi import APIRouter

from src.api.v1 import foods, health, stock

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(foods.router)
api_router.include_router(stock.router)
# TODO: Phase 0c〜 で追加: recipes, meal_plans, meals, shopping, family, admin, agent
