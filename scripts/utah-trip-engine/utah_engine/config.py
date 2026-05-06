from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pilot configuration. Loads from .env in the package root."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:54350/utah_engine",
        alias="DATABASE_URL",
    )

    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-haiku-4-5", alias="ANTHROPIC_MODEL")

    moab_lat: float = Field(default=38.5733, alias="MOAB_LAT")
    moab_lng: float = Field(default=-109.5498, alias="MOAB_LNG")
    radius_mi: float = Field(default=50.0, alias="RADIUS_MI")

    budget_cap: float = Field(default=10.0, alias="BUDGET_CAP")

    reddit_user_agent: str = Field(
        default="roamswild-utah-pilot/0.1",
        alias="REDDIT_USER_AGENT",
    )

    nps_api_key: str = Field(default="DEMO_KEY", alias="NPS_API_KEY")


settings = Settings()


def set_active_region(lat: float, lng: float, radius_mi: float) -> None:
    """Override the in-process anchor so a single CLI run can target a non-Moab region.

    Modules read ``settings.moab_lat`` / ``settings.moab_lng`` / ``settings.radius_mi``
    at call time. Mutating the singleton before any ingester runs is the lowest-risk
    way to repoint the pipeline without threading an anchor parameter through every
    module. The field names stay ``moab_*`` for backward compatibility.
    """
    settings.moab_lat = lat
    settings.moab_lng = lng
    settings.radius_mi = radius_mi
