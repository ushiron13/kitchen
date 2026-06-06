from typing import Optional

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class MealFeedback(Base):
    """好み学習用フィードバック（Phase 2+）。meal.status の cooked/skipped に加え、
    詳細な評価・スキップ理由を記録する。集計クエリで嗜好シグナルを抽出できる。"""

    __tablename__ = "meal_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meal.id", ondelete="CASCADE"), nullable=False
    )
    satisfaction: Mapped[Optional[int]] = mapped_column(Integer)  # 1–5
    skip_reason: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    meal: Mapped["Meal"] = relationship("Meal", back_populates="feedbacks")

    __table_args__ = (Index("idx_meal_feedback_meal_id", "meal_id"),)


class MealPlan(Base):
    __tablename__ = "meal_plan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    start_date: Mapped[str] = mapped_column(Text, nullable=False)
    end_date: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    meals: Mapped[list["Meal"]] = relationship(
        "Meal", back_populates="meal_plan", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','confirmed','completed','cancelled')",
            name="ck_meal_plan_status",
        ),
        Index("idx_meal_plan_date_range", "start_date", "end_date"),
    )


class Meal(Base):
    __tablename__ = "meal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meal_plan_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("meal_plan.id", ondelete="CASCADE")
    )
    recipe_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("recipe.id"))
    served_date: Mapped[str] = mapped_column(Text, nullable=False)
    meal_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="planned")
    concept: Mapped[Optional[str]] = mapped_column(Text)
    estimated_ingredients: Mapped[Optional[str]] = mapped_column(Text)  # JSON array
    cook_time_min_estimate: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    meal_plan: Mapped[Optional["MealPlan"]] = relationship("MealPlan", back_populates="meals")
    recipe: Mapped[Optional["Recipe"]] = relationship("Recipe")  # type: ignore[name-defined]
    feedbacks: Mapped[list["MealFeedback"]] = relationship(
        "MealFeedback", back_populates="meal", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "meal_type IN ('breakfast','lunch','dinner','snack')",
            name="ck_meal_meal_type",
        ),
        CheckConstraint(
            "status IN ('planned','cooked','skipped')",
            name="ck_meal_status",
        ),
        Index("idx_meal_plan_id", "meal_plan_id"),
        Index("idx_meal_served_date", "served_date"),
    )
