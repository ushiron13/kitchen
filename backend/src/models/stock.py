from typing import Optional

from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StockItem(Base):
    __tablename__ = "stock_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    food_id: Mapped[int] = mapped_column(Integer, ForeignKey("food_master.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(REAL, nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    expiry_date: Mapped[Optional[str]] = mapped_column(Text)
    purchased_date: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(Text)
    opened: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    location: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    food: Mapped["FoodMaster"] = relationship("FoodMaster", back_populates="stock_items")  # type: ignore[name-defined]
    transactions: Mapped[list["StockTransaction"]] = relationship(
        "StockTransaction", back_populates="stock_item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_stock_item_quantity"),
        CheckConstraint("opened IN (0,1)", name="ck_stock_item_opened"),
        CheckConstraint(
            "category IS NULL OR category IN ('refrigerated','frozen','pantry','ambient','seasoning')",
            name="ck_stock_item_category",
        ),
        Index("idx_stock_item_food_id", "food_id"),
        Index("idx_stock_item_expiry_date", "expiry_date"),
    )


class StockTransaction(Base):
    __tablename__ = "stock_transaction"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_item.id"), nullable=False)
    tx_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity_delta: Mapped[float] = mapped_column(REAL, nullable=False)
    meal_id: Mapped[Optional[int]] = mapped_column(Integer)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    stock_item: Mapped["StockItem"] = relationship("StockItem", back_populates="transactions")

    __table_args__ = (
        CheckConstraint(
            "tx_type IN ('in','out','consume','waste','adjust')",
            name="ck_stock_tx_type",
        ),
        Index("idx_stock_tx_item_id", "stock_item_id"),
        Index("idx_stock_tx_created_at", "created_at"),
    )
