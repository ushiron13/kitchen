from typing import Optional

from sqlalchemy import CheckConstraint, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    family_composition: Mapped[Optional[str]] = mapped_column(Text)
    food_preferences: Mapped[Optional[str]] = mapped_column(Text)
    allergies: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_user_profile_singleton"),
    )
