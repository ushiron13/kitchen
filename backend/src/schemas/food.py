from typing import Literal, Optional

from pydantic import BaseModel, Field

FoodCategory = Literal["refrigerated", "frozen", "pantry", "ambient", "seasoning"]


class FoodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: FoodCategory
    default_shelf_days: Optional[int] = Field(None, ge=1)


class FoodUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[FoodCategory] = None
    default_shelf_days: Optional[int] = Field(None, ge=1)


class FoodRead(BaseModel):
    id: int
    name: str
    category: FoodCategory
    default_shelf_days: Optional[int]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
