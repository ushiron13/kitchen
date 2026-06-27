from typing import Literal

from pydantic import BaseModel, Field

MealStatus = Literal["planned", "cooked", "skipped"]

MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class MealPlanCreate(BaseModel):
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    days: int = Field(7, ge=1, le=14)
    meal_types: list[MealType] = ["dinner"]
    preferences: str | None = Field(
        None, max_length=500, description="LLMへの自然言語要望（例: 和食多め、30分以内）"
    )


class MealRead(BaseModel):
    id: int
    meal_plan_id: int | None
    recipe_id: int | None
    served_date: str
    meal_type: str
    status: str
    concept: str | None
    estimated_ingredients: list[str] | None
    cook_time_min_estimate: int | None
    notes: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class MealStatusUpdate(BaseModel):
    status: MealStatus


class MealPlanRead(BaseModel):
    id: int
    start_date: str
    end_date: str
    status: str
    notes: str | None
    meals: list[MealRead]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
