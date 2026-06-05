from typing import Literal, Optional

from pydantic import BaseModel, Field

MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class MealPlanCreate(BaseModel):
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    days: int = Field(7, ge=1, le=14)
    meal_types: list[MealType] = ["dinner"]
    notes: Optional[str] = Field(None, max_length=500)


class MealRead(BaseModel):
    id: int
    meal_plan_id: Optional[int]
    recipe_id: Optional[int]
    served_date: str
    meal_type: str
    status: str
    concept: Optional[str]
    estimated_ingredients: Optional[list[str]]
    cook_time_min_estimate: Optional[int]
    notes: Optional[str]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class MealPlanRead(BaseModel):
    id: int
    start_date: str
    end_date: str
    status: str
    notes: Optional[str]
    meals: list[MealRead]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
