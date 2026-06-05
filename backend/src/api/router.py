from fastapi import APIRouter

from src.api.v1 import foods, health, meal_plans, meals, recipes, stock

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(foods.router)
api_router.include_router(stock.router)
api_router.include_router(meal_plans.router)
api_router.include_router(meals.router)
api_router.include_router(recipes.router)
