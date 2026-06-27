from pydantic import BaseModel, Field


class RecipeIngredientRead(BaseModel):
    id: int
    food_id: int | None
    raw_name: str | None
    quantity: float | None
    unit: str | None
    is_main: bool
    notes: str | None

    model_config = {"from_attributes": True}


class RecipeRead(BaseModel):
    id: int
    name: str
    instructions_md: str
    cook_time_min: int | None
    cost_estimate: str | None
    is_favorite: bool
    reuse_count: int
    ingredients: list[RecipeIngredientRead]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class RecipeSuggestRequest(BaseModel):
    food_names: list[str] = Field(
        ..., min_length=1, max_length=10, description="提案のベースとなる食材名リスト"
    )
    count: int = Field(1, ge=1, le=3, description="生成するレシピ案の数")
