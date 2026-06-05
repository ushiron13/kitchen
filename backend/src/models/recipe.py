from typing import Optional

from sqlalchemy import REAL, CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Recipe(Base):
    __tablename__ = "recipe"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    instructions_md: Mapped[str] = mapped_column(Text, nullable=False)
    cook_time_min: Mapped[Optional[int]] = mapped_column(Integer)
    cost_estimate: Mapped[Optional[str]] = mapped_column(Text)
    image_path: Mapped[Optional[str]] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="llm")
    external_id: Mapped[Optional[str]] = mapped_column(Text)
    is_favorite: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_archived: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reuse_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        "RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("source IN ('llm','external','manual')", name="ck_recipe_source"),
        CheckConstraint("is_favorite IN (0,1)", name="ck_recipe_is_favorite"),
        CheckConstraint("is_archived IN (0,1)", name="ck_recipe_is_archived"),
        Index("idx_recipe_is_favorite", "is_favorite"),
        Index("idx_recipe_archived", "is_archived"),
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredient"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipe.id", ondelete="CASCADE"), nullable=False
    )
    food_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("food_master.id"))
    raw_name: Mapped[Optional[str]] = mapped_column(Text)
    quantity: Mapped[Optional[float]] = mapped_column(REAL)
    unit: Mapped[Optional[str]] = mapped_column(Text)
    is_main: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ingredients")

    __table_args__ = (
        CheckConstraint("is_main IN (0,1)", name="ck_recipe_ingredient_is_main"),
        Index("idx_recipe_ingredient_recipe_id", "recipe_id"),
    )
