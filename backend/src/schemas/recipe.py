from typing import Optional

from pydantic import BaseModel, Field


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


class RecipeSuggestRequest(BaseModel):
    food_names: list[str] = Field(..., min_length=1, max_length=10, description="提案のベースとなる食材名リスト")
    count: int = Field(1, ge=1, le=3, description="生成するレシピ案の数")
