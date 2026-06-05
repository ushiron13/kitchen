from typing import Optional

from pydantic import BaseModel


class ShoppingItem(BaseModel):
    name: str
    in_stock: bool
    stock_quantity: Optional[float] = None
    stock_unit: Optional[str] = None


class ShoppingListRead(BaseModel):
    meal_plan_id: int
    items: list[ShoppingItem]
