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

    # ----- AI CRM (Phần B) — chấm điểm / insight lead bằng Claude thật -----
    # Model rẻ (haiku) cho scoring/insight để tiết kiệm chi phí. Trống → fallback
    # sang llm_model. Đổi qua env AI_CRM_MODEL nếu cần.
    ai_crm_model: str = "claude-haiku-4-5-20251001"
    # Giới hạn số lead xử lý mỗi lần rescore (bảo vệ chi phí + tránh quá tải API).
    ai_crm_batch_limit: int = 25
    # Ngưỡng auto-pipeline theo ai_score: >= hot → "hot", >= warm → "warm".
    ai_crm_hot_threshold: int = 80
    ai_crm_warm_threshold: int = 50
    # max_tokens mỗi lần gọi Claude (output JSON ngắn) — chặn chi phí.
    ai_crm_max_tokens: int = 320

    # ----- AI Marketing — chiến dịch đa kênh + AI sản xuất nội dung -----
    # Store JSON collection (campaigns + content history), resolve giống leads_file.
    marketing_campaigns_file: str = "data/_runtime/marketing_campaigns.json"
    marketing_content_file: str = "data/_runtime/marketing_content.json"
    # Số bản ghi nội dung AI lưu lại tối đa (rotate cũ nhất khi vượt).
    marketing_content_keep: int = 500
    # Model sinh nội dung — trống → fallback llm_model (opus, chất lượng copywriting
    # tốt). Đổi qua env MARKETING_MODEL nếu muốn model rẻ hơn (haiku).
    marketing_model: str = ""
    # max_tokens mỗi lần sinh nội dung (nhiều biến thể) — chặn chi phí.
    marketing_max_tokens: int = 1500
    # Doanh thu quy đổi ước tính trên mỗi khách chuyển đổi (VND) — để tính ROI khi
    # chưa có dữ liệu deal thật. 0 → doanh thu/ROI hiển thị 0 (không bịa số).
    marketing_revenue_per_customer: float = 0

    # ----- MARKETING PIPELINE — dây chuyền sản xuất content AI nhiều giai đoạn -----
    # Store JSON pipeline + output từng giai đoạn (resolve giống marketing_store).
    marketing_pipeline_file: str = "data/_runtime/marketing_pipelines.json"
    # Số pipeline lưu tối đa (rotate cũ nhất khi vượt) — chặn phình file.
    marketing_pipeline_keep: int = 200
    # max_tokens mỗi giai đoạn AI (research/script/content/video_script) — chặn chi phí.
    marketing_pipeline_max_tokens: int = 1800

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

    # ----- n8n REST API quản trị (trang admin "Automation") -----
    # Dùng để LIỆT KÊ / BẬT-TẮT / xem executions của toàn bộ workflow n8n từ
    # admin. KHÁC với webhook ở trên (webhook là n8n GỌI VÀO; đây là backend GỌI
    # RA n8n). Base URL trống → tự suy từ platform_n8n_url. API key tạo trong
    # n8n: Settings → n8n API → Create an API key, rồi đặt env N8N_API_KEY.
    # Trống N8N_API_KEY → mọi endpoint /admin/automation trả "chưa cấu hình"
    # (không 500), kèm hướng dẫn set key cho admin.
    n8n_api_url: str = ""
    n8n_api_key: str = ""
    # Fallback key: hệ thống có thể đã set sẵn N8N_API_KEY_TEMP / N8N_API_TOKEN.
    # Resolve theo thứ tự ưu tiên: N8N_API_KEY → N8N_API_KEY_TEMP → N8N_API_TOKEN.
    n8n_api_key_temp: str = ""
    n8n_api_token: str = ""

    def n8n_api_base(self) -> str:
        """Base URL REST API n8n (không kèm /api/v1). Fallback platform_n8n_url."""
        return (self.n8n_api_url or self._n8n_base()).rstrip("/")

    def n8n_api_key_resolved(self) -> str:
        """Key dùng để gọi n8n — ưu tiên N8N_API_KEY, fallback TEMP rồi TOKEN."""
        return self.n8n_api_key or self.n8n_api_key_temp or self.n8n_api_token

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

    # ----- NHÂN SỰ (HR) — ma trận quyền theo vai trò + mục tiêu KPI -----
    # JSON store (resolve giống users_file: DATA_DIR / agent-engine / CWD). Sau
    # migrate PostgreSQL. Ma trận quyền tự seed mặc định khi file rỗng.
    hr_roles_file: str = "data/_runtime/hr_roles.json"
    hr_objectives_file: str = "data/_runtime/hr_objectives.json"

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

    # Chính sách bán hàng (phương án thanh toán + chiết khấu + VAT/bảo trì) cho
    # phiếu tính giá. Cùng pattern store với commission_config (version + backup).
    sales_policy_file: str = "data/_runtime/sales_policy.json"
    sales_policy_backup_keep: int = 10

    # ----- TÀI CHÍNH (chi phí + doanh thu thủ công) -----
    # JSON store {costs:[], manual_revenue:[]} cho module "Tài chính" admin.
    # Doanh thu THẬT tổng hợp tự động từ hoa hồng (commission_store) + deal chốt;
    # đây chỉ lưu chi phí người dùng nhập + doanh thu nhập tay (nếu có). Resolve
    # giống users_file (DATA_DIR Railway volume / agent-engine / CWD). Sau migrate
    # PostgreSQL. Mô hình doanh thu công ty môi giới = phần hoa hồng nhận được.
    finance_file: str = "data/_runtime/finance.json"
    # Model Claude dùng cho phân tích tài chính (text dài hơn AI CRM). Trống →
    # fallback llm_model. Đổi qua env FINANCE_AI_MODEL nếu cần.
    finance_ai_model: str = "claude-haiku-4-5-20251001"
    finance_ai_max_tokens: int = 1200

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
    # Lịch tạo sự kiện Meet. Mặc định "primary" = lịch của CHÍNH tài khoản đã
    # Connect (luôn có quyền ghi → tránh 403/404). Override bằng email cụ thể nếu
    # muốn tạo trên lịch khác (tài khoản Connect phải có quyền ghi lịch đó).
    google_workspace_calendar_email: str = "primary"
    # Store bền refresh token Workspace lấy qua luồng "Connect" trên admin (ưu tiên
    # hơn env google_workspace_refresh_token). Resolve giống users_file.
    google_workspace_token_file: str = "data/_runtime/google_workspace.json"
    # Redirect URI cho luồng Connect Workspace. Trống → tự suy ra từ host của
    # google_oauth_redirect_uri (đổi path → /auth/workspace/callback).
    google_workspace_redirect_uri: str = ""

    # ----- Stringee (Tổng đài / Call Center) -----
    # API Key của project Stringee: SID + Secret tạo trong Stringee Dashboard
    # (Project → API key). Secret KÝ JWT access token — TUYỆT ĐỐI không lộ ra FE,
    # không commit vào code (đặt env trên Railway). Trống → tính năng tổng đài tự
    # TẮT (endpoint /crm/call/* trả 503 "chưa cấu hình", nút Gọi ẩn trên FE).
    stringee_api_key_sid: str = ""
    stringee_api_key_secret: str = ""
    # Số tổng đài (Stringee number) dùng làm số gọi đi (from) khi callout server.
    stringee_from_number: str = ""
    # TTL (giây) cho client access token cấp cho Web SDK của sale — token tạm thời.
    stringee_token_ttl: int = 3600
    # Base URL CÔNG KHAI để Stringee gọi webhook (answer_url/event_url) + dựng
    # eventUrl ghi âm trong SCCO. Phải là domain Stringee truy cập được từ ngoài.
    stringee_webhook_base: str = "https://api.eurowindowlightcity.net"


settings = Settings()
