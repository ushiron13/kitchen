from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API keys
    anthropic_api_key: str
    kitchen_api_key: str

    # LangSmith
    langchain_tracing_v2: bool = False
    langchain_api_key: str = ""
    langchain_project: str = "kitchen-agent"

    # Paths
    db_path: str = "/data/app.db"
    nas_images_path: str = "/nas/recipe_images"
    prompts_dir: str = "/app/prompts"

    # CORS
    allowed_origins: list[str] = Field(default=["https://kitchen.local"])

    # Misc
    log_level: str = "INFO"
    tz: str = "Asia/Tokyo"


settings = Settings()  # type: ignore[call-arg]
