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

    # Knowledge base mặc định cho kênh chat (Chatwoot webhook).
    elc_project_slug: str = "eurowindow-light-city"

    # Chatwoot Agent Bot integration (webhook /webhook/chatwoot).
    # CHATWOOT_API_TOKEN đặt trên Railway sau khi tạo Agent Bot (xem hướng dẫn).
    chatwoot_base_url: str = "https://chat.eurowindowlightcity.net"
    chatwoot_api_token: str = ""  # TODO: điền access token của Agent Bot
    chatwoot_account_id: int = 1
    chatwoot_bds_team_id: int = 0  # 0 = chưa cấu hình → bỏ qua auto-assign
    chatwoot_hot_lead_label: str = "hot-lead"

    # CORS (cho dashboard + landing page + admin gọi vào)
    cors_allow_origins: str = (
        "http://localhost:3000,"
        "http://localhost:3001,"
        "https://eurowindowlightcity.net,"
        "https://www.eurowindowlightcity.net,"
        "https://admin.eurowindowlightcity.net,"
        "https://app.eurowindowlightcity.net"
    )

    # URL các nền tảng vệ tinh — dùng cho /admin/platforms/health.
    # Override qua env (PLATFORM_N8N_URL, ...) nếu subdomain thực tế khác.
    platform_n8n_url: str = "https://n8n.eurowindowlightcity.net"
    platform_note_url: str = "https://note.eurowindowlightcity.net"
    platform_bot_url: str = "https://bot.eurowindowlightcity.net"
    platform_chat_url: str = "https://chat.eurowindowlightcity.net"

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
    # Booking store tạm (JSON) — flow đặt lịch xem nhà. Sau Sprint 1.1 migrate
    # PostgreSQL. Resolve giống users_file (DATA_DIR / agent-engine / CWD).
    bookings_file: str = "data/_runtime/bookings.json"

    # Sale Learning Center — thư mục lưu tài liệu upload + index BM25 + phiếu báo
    # giá. Tương đối thì resolve theo $DATA_DIR (Railway volume) hoặc thư mục
    # agent-engine; tuyệt đối thì dùng nguyên (xem core/learning_store.py).
    learning_dir: str = "data/learning"


settings = Settings()
