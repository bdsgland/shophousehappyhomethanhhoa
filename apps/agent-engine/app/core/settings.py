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

    # ----- Automation n8n (3 workflow: hot-lead, commission, daily-briefing) -----
    # Để trống → tự dựng URL từ platform_n8n_url + path mặc định. Đặt env
    # N8N_HOT_LEAD_WEBHOOK_URL / N8N_COMMISSION_WEBHOOK_URL nếu path khác.
    n8n_hot_lead_webhook_url: str = ""
    n8n_commission_webhook_url: str = ""

    # Telegram Bot (sale nhận alert + briefing). Token lấy từ @BotFather, đặt
    # env TELEGRAM_BOT_TOKEN trên Railway. KHÔNG commit token vào code.
    telegram_bot_token: str = ""
    telegram_bot_username: str = "elc_sale_bot"  # không có @, dùng dựng link t.me

    # Secret chia sẻ cho webhook nội bộ + n8n gọi vào API (header X-Internal-Token).
    # Trống ở dev = không bắt buộc; production NÊN đặt env INTERNAL_WEBHOOK_TOKEN.
    internal_webhook_token: str = ""

    def _n8n_base(self) -> str:
        # platform_n8n_url do module platforms cấu hình; fallback nếu chưa có.
        return getattr(
            self, "platform_n8n_url", "https://n8n.eurowindowlightcity.net"
        ).rstrip("/")

    def hot_lead_webhook_url(self) -> str:
        return self.n8n_hot_lead_webhook_url or f"{self._n8n_base()}/webhook/hot-lead-alert"

    def commission_webhook_url(self) -> str:
        return (
            self.n8n_commission_webhook_url
            or f"{self._n8n_base()}/webhook/commission-calc"
        )

    # Auth (MVP — JWT đơn giản, file-based user store)
    jwt_secret: str = ""  # trống → dùng secret tạm theo process (chỉ dev)
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 8  # 8 giờ
    users_file: str = "data/_runtime/users.json"


settings = Settings()
