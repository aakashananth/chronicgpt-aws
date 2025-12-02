"""Configuration management for AWS Lambda functions."""

from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Ultrahuman API configuration
    ULTRAHUMAN_API_BASE_URL: str = ""
    ULTRAHUMAN_API_KEY: str = ""
    ULTRAHUMAN_EMAIL: str = ""
    ULTRAHUMAN_PATIENT_ID: Optional[str] = None

    # AWS S3 configuration - separate buckets for each data type
    RAW_DATA_BUCKET_NAME: str = "ultrahuman-raw-data"
    PROCESSED_DATA_BUCKET_NAME: str = "health-metrics-processed"
    EXPLANATIONS_BUCKET_NAME: str = "health-llm-explanations"

    # Azure OpenAI configuration (for explanation generation)
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o-mini"
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"

    # Logging configuration
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


# Global settings instance
settings = Settings()

