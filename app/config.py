from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str

    # App
    APP_ENV: str = "development"
    APP_URL: str = "http://localhost:8080"
    RATE_LIMIT_RPM: int = 60


settings = Settings()  # type: ignore[call-arg]
