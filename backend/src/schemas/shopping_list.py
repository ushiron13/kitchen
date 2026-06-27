from pydantic import BaseModel


class ShoppingItem(BaseModel):
    name: str
    in_stock: bool
    stock_quantity: float | None = None
    stock_unit: str | None = None


class ShoppingListRead(BaseModel):
    meal_plan_id: int
    items: list[ShoppingItem]
