from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

TxType = Literal["in", "out", "consume", "waste", "adjust"]
CategoryType = Literal["refrigerated", "frozen", "pantry", "ambient", "seasoning"]


class StockCreate(BaseModel):
    food_id: int
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1, max_length=20)
    expiry_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    purchased_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Optional[CategoryType] = None
    opened: bool = False
    location: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=200)


class StockUpdate(BaseModel):
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, min_length=1, max_length=20)
    expiry_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    purchased_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Optional[CategoryType] = None
    opened: Optional[bool] = None
    location: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=200)


class StockRead(BaseModel):
    id: int
    food_id: int
    food_name: str
    food_category: str
    default_shelf_days: Optional[int]
    quantity: float
    unit: str
    expiry_date: Optional[str]
    purchased_date: Optional[str]
    opened: bool
    location: Optional[str]
    notes: Optional[str]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class TxCreate(BaseModel):
    tx_type: TxType
    quantity_delta: float
    reason: Optional[str] = Field(None, max_length=200)

    @field_validator("quantity_delta")
    @classmethod
    def must_be_nonzero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("quantity_delta must not be zero")
        return v
