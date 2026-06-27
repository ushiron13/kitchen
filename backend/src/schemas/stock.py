from typing import Literal

from pydantic import BaseModel, Field, field_validator

TxType = Literal["in", "out", "consume", "waste", "adjust"]
CategoryType = Literal["refrigerated", "frozen", "pantry", "ambient", "seasoning"]


class StockCreate(BaseModel):
    food_id: int
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1, max_length=20)
    expiry_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    purchased_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: CategoryType | None = None
    opened: bool = False
    location: str | None = Field(None, max_length=50)
    notes: str | None = Field(None, max_length=200)


class StockUpdate(BaseModel):
    quantity: float | None = Field(None, ge=0)
    unit: str | None = Field(None, min_length=1, max_length=20)
    expiry_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    purchased_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: CategoryType | None = None
    opened: bool | None = None
    location: str | None = Field(None, max_length=50)
    notes: str | None = Field(None, max_length=200)


class StockRead(BaseModel):
    id: int
    food_id: int
    food_name: str
    food_category: str
    default_shelf_days: int | None
    quantity: float
    unit: str
    expiry_date: str | None
    purchased_date: str | None
    opened: bool
    location: str | None
    notes: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class TxCreate(BaseModel):
    tx_type: TxType
    quantity_delta: float
    reason: str | None = Field(None, max_length=200)

    @field_validator("quantity_delta")
    @classmethod
    def must_be_nonzero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("quantity_delta must not be zero")
        return v
