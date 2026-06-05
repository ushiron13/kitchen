from typing import Optional

from pydantic import BaseModel


class RecipeIngredientRead(BaseModel):
    id: int
    food_id: Optional[int]
    raw_name: Optional[str]
    quantity: Optional[float]
    unit: Optional[str]
    is_main: bool
    notes: Optional[str]

    model_config = {"from_attributes": True}


class RecipeRead(BaseModel):
    id: int
    name: str
    instructions_md: str
    cook_time_min: Optional[int]
    cost_estimate: Optional[str]
    is_favorite: bool
    reuse_count: int
    ingredients: list[RecipeIngredientRead]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
