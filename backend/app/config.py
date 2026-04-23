"""
Application configuration using Pydantic Settings.
All values read from environment variables or .env file.
"""
from pydantic_settings import BaseSettings
from typing import List, Optional
import os


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/energy_intelligence"
    DATABASE_SYNC_URL: str = "postgresql://postgres:password@localhost:5432/energy_intelligence"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Geolocation
    OPENCAGE_API_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # SEC EDGAR
    EDGAR_BASE_URL: str = "https://efts.sec.gov/LATEST/search-index"
    EDGAR_FILING_BASE: str = "https://www.sec.gov"
    SEC_USER_AGENT: str = "EnergyIntelligenceEngine research@example.com"

    # Processing
    MAX_CONCURRENT_SCRAPES: int = 5
    BATCH_SIZE: int = 10
    CACHE_TTL: int = 3600

    @property
    def cors_origins_list(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS.split(",")]

    class Config:
        extra = "ignore"
        env_file = ".env"
        case_sensitive = True


settings = Settings()
