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

    # ----- OpenClaw "God-Mode Bridge" (AI Assistant riêng cho CEO) -----
    # Token đặc biệt cho dịch vụ OpenClaw gọi vào prefix /openclaw (bypass role
    # check). Trống → TẮT toàn bộ bridge (mọi endpoint /openclaw trả 403). Sinh
    # bằng `openssl rand -hex 32`, đặt env OPENCLAW_GOD_TOKEN trên Railway.
    # TUYỆT ĐỐI không commit giá trị vào code.
    openclaw_god_token: str = ""
    # Bot Telegram riêng của CEO (khác TELEGRAM_BOT_TOKEN của sale). Để trống →
    # /openclaw/telegram/send fallback sang telegram_bot_token nếu có.
    openclaw_telegram_bot_token: str = ""
    # chat_id Telegram của riêng anh Phạm Văn Thư — dùng cho daily summary +
    # giới hạn người bot CEO phục vụ. Điền sau khi /start bot lần đầu.
    openclaw_ceo_chat_id: str = ""
    # Anthropic Admin API key (khác ANTHROPIC_API_KEY thường) cho /openclaw/cost/anthropic.
    # Trống → endpoint trả {"configured": false} thay vì bịa số liệu.
    anthropic_admin_key: str = ""
    # Railway API token (Account/Team token) cho /openclaw/platforms/restart + logs.
    # Trống → các endpoint điều khiển Railway trả 503 (chưa cấu hình).
    railway_api_token: str = ""

    # ----- SMTP (gửi email qua /openclaw/email/send + /openclaw/announce) -----
    # Trống → endpoint email trả 503 (chưa cấu hình). KHÔNG commit mật khẩu.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

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

    # ----- Google Sign-in (OAuth2) -----
    # Tạo OAuth client type "External" RIÊNG cho Sign-in (KHÔNG dùng client
    # Internal hiện có) — xem docs/google-signin-setup.md. Để trống → tính năng
    # đăng nhập Google tự TẮT (endpoint trả 503), email+password vẫn hoạt động.
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    # Base URL các portal để callback redirect về (đọc token từ URL fragment).
    frontend_url: str = "http://localhost:3000"  # web (client + sale)
    admin_url: str = "http://localhost:3001"  # cổng quản trị admin
    # Domain workspace: chỉ email thuộc domain này mới được đăng nhập role=admin.
    google_workspace_domain: str = "eurowindowlightcity.net"

    # Auth (MVP — JWT đơn giản, file-based user store)
    jwt_secret: str = ""  # trống → dùng secret tạm theo process (chỉ dev)
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 8  # 8 giờ
    users_file: str = "data/_runtime/users.json"
    # Booking store tạm (JSON) — flow đặt lịch xem nhà. Sau Sprint 1.1 migrate
    # PostgreSQL. Resolve giống users_file (DATA_DIR / agent-engine / CWD).
    bookings_file: str = "data/_runtime/bookings.json"

    # CRM stores tạm (JSON) — quản lý khách hàng + daily task + hot lead.
    # Resolve giống users_file. Sau migrate PostgreSQL.
    leads_file: str = "data/_runtime/leads.json"
    contact_logs_file: str = "data/_runtime/contact_logs.json"
    sale_tasks_file: str = "data/_runtime/sale_tasks.json"

    # Quỹ căn (inventory) — JSON store đồng bộ từ Google Sheets chủ đầu tư.
    # Resolve giống users_file (DATA_DIR Railway volume / agent-engine / CWD).
    # File backup tự sinh trong cùng thư mục: _runtime/backups/inventory-*.json
    inventory_file: str = "data/_runtime/inventory.json"
    # Số bản backup gần nhất giữ lại trước mỗi lần sync (rotate, xoá bản cũ hơn).
    inventory_backup_keep: int = 10

    # Cơ chế hoa hồng (5 bậc + KPI lũy tiến) — JSON store 1 object, admin cấu hình.
    # Resolve giống users_file (DATA_DIR Railway volume / agent-engine / CWD).
    # Backup tự sinh trong _runtime/backups/commission_config-*.json mỗi lần update.
    commission_config_file: str = "data/_runtime/commission_config.json"
    commission_config_backup_keep: int = 10

    # Sale Learning Center — thư mục lưu tài liệu upload + index BM25 + phiếu báo
    # giá. Tương đối thì resolve theo $DATA_DIR (Railway volume) hoặc thư mục
    # agent-engine; tuyệt đối thì dùng nguyên (xem core/learning_store.py).
    learning_dir: str = "data/learning"
    # Trạng thái + lịch sử job đồng bộ tài liệu từ Google Drive (atomic JSON).
    # Resolve giống users_file (DATA_DIR Railway volume / agent-engine / CWD).
    drive_sync_jobs_file: str = "data/_runtime/drive_sync_jobs.json"
    # Folder Drive mặc định gợi ý trên UI admin (chủ đầu tư ELC).
    drive_default_folder_url: str = (
        "https://drive.google.com/drive/folders/1Cct7yxa-BmJzxfaVc9R-CAVmSbFeLpAV"
    )

    # ----- Live Match (Uber-style khách ↔ sale realtime qua Google Meet) -----
    # Store JSON lịch sử match (resolve giống users_file). Sau migrate Postgres.
    match_requests_file: str = "data/_runtime/match_requests.json"
    # Thời gian sale có để bấm Accept trước khi invite hết hạn → tìm sale kế.
    match_invite_timeout_seconds: int = 15
    # Coi sale là "mất kết nối" nếu không heartbeat quá ngưỡng này (giây).
    match_presence_stale_seconds: int = 60
    # Refresh token OAuth của tài khoản Workspace (info@eurowindowlightcity.net)
    # dùng tạo Google Meet qua Calendar API. Lấy qua scripts/get_google_refresh_token.py
    # hoặc từ credential n8n. Để trống → tạo Meet trả lỗi, hệ thống fallback
    # "sale sẽ gọi điện". KHÔNG commit token vào code — đặt env trên Railway.
    google_workspace_refresh_token: str = ""
    # Email lịch Workspace tạo sự kiện Meet (thường = tài khoản đã cấp refresh token).
    google_workspace_calendar_email: str = "info@eurowindowlightcity.net"


settings = Settings()
