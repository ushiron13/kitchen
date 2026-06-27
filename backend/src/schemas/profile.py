from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    family_composition: str | None = Field(None, max_length=200)
    food_preferences: str | None = Field(None, max_length=500)
    allergies: str | None = Field(None, max_length=200)


class ProfileRead(BaseModel):
    family_composition: str | None
    food_preferences: str | None
    allergies: str | None
    updated_at: str

    model_config = {"from_attributes": True}
