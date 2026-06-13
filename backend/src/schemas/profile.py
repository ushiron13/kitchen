from typing import Optional

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    family_composition: Optional[str] = Field(None, max_length=200)
    food_preferences: Optional[str] = Field(None, max_length=500)
    allergies: Optional[str] = Field(None, max_length=200)


class ProfileRead(BaseModel):
    family_composition: Optional[str]
    food_preferences: Optional[str]
    allergies: Optional[str]
    updated_at: str

    model_config = {"from_attributes": True}
