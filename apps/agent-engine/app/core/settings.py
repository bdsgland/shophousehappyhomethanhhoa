"""Cấu hình ứng dụng — đọc từ biến môi trường / file .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # LLM
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-4-7"
    use_mock_llm: bool = True

    # Embedding
    voyage_api_key: str = ""
    openai_api_key: str = ""

    # Database (chưa dùng ở MVP — để trống chạy in-memory)
    database_url: str = ""

    # Agent behaviour
    lead_hot_score_threshold: int = 70

    # CORS (cho dashboard + landing page gọi vào)
    cors_allow_origins: str = (
        "http://localhost:3000,"
        "https://eurowindowlightcity.net,"
        "https://www.eurowindowlightcity.net"
    )

    # Auth (MVP — JWT đơn giản, file-based user store)
    jwt_secret: str = ""  # trống → dùng secret tạm theo process (chỉ dev)
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 8  # 8 giờ
    users_file: str = "data/_runtime/users.json"


settings = Settings()
