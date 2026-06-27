from typing import Literal

from pydantic import BaseModel, Field

FoodCategory = Literal["refrigerated", "frozen", "pantry", "ambient", "seasoning"]


class FoodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: FoodCategory
    default_shelf_days: int | None = Field(None, ge=1)


class FoodUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    category: FoodCategory | None = None
    default_shelf_days: int | None = Field(None, ge=1)


class FoodRead(BaseModel):
    id: int
    name: str
    category: FoodCategory
    default_shelf_days: int | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
