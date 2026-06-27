from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class FoodMaster(Base):
    __tablename__ = "food_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    default_shelf_days: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    aliases: Mapped[list["FoodAlias"]] = relationship(
        "FoodAlias", back_populates="food", cascade="all, delete-orphan"
    )
    stock_items: Mapped[list["StockItem"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "StockItem", back_populates="food"
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('refrigerated','frozen','pantry','ambient','seasoning')",
            name="ck_food_master_category",
        ),
        Index("idx_food_master_category", "category"),
    )


class FoodAlias(Base):
    __tablename__ = "food_alias"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_master.id", ondelete="CASCADE"), nullable=False
    )
    alias: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="manual")
    confidence: Mapped[float | None] = mapped_column(REAL)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    food: Mapped["FoodMaster"] = relationship("FoodMaster", back_populates="aliases")

    __table_args__ = (
        CheckConstraint("source IN ('manual','llm_inferred')", name="ck_food_alias_source"),
        Index("idx_food_alias_alias", "alias"),
        Index("idx_food_alias_food_id", "food_id"),
    )
