# BÁO CÁO TRẠNG THÁI HỆ THỐNG — Agent-Proptech

**Ngày rà soát:** 12/06/2026  ·  **Phạm vi:** chỉ đọc code (KHÔNG sửa)
**Thành phần:** backend `apps/agent-engine` (FastAPI) · admin `apps/admin` (Next.js) · web `apps/web` (cổng khách + dashboard sale `/agent`)

---

## 0. TÓM TẮT NHANH

- **Admin đã "thông" về mặt code.** Tất cả 17 mục menu admin (`nav-items.ts`) đều có router backend tương ứng đăng ký trong `main.py` (`_ROUTER_SPECS`). App khởi động chịu lỗi tốt: thiếu DB/dịch vụ ngoài KHÔNG làm chết app (graceful degradation).
- **Điểm nghẽn KHÔNG nằm ở code mà ở CẤU HÌNH.** File `.env` thật hiện tại CHỈ có: `ANTHROPIC_API_KEY`, `LLM_MODEL`, `USE_MOCK_LLM=false`, `JWT_SECRET`, `CORS`. **Toàn bộ dịch vụ ngoài đều CHƯA cấu hình:** Dify, Stringee, Chatwoot, n8n, Google OAuth/Workspace, Telegram, SMTP, Postgres, CrewAI.
- **Hệ quả:** Nhóm tính năng "lõi AI + CRM + bảng hàng + hoa hồng + chính sách giá + Live Match (phần ghép cặp)" → **chạy được ngay** (dùng Claude trực tiếp + JSON store). Nhóm "gọi điện / hộp thư đa kênh / automation / đăng nhập Google / Meet link / import từ Google Sheet" → **cần điền key mới thông**.
- **Đồng bộ dữ liệu Admin ↔ Sale ↔ Khách:** Phần lớn đã dùng CHUNG store (`lead_store`, `inventory_store`, `sales_policy_store`, `commission`) → **đồng bộ thật**. **NGOẠI LỆ quan trọng:** endpoint công khai `/leads` (file `leads.py`) dùng store in-memory `_LEADS` RIÊNG, **KHÔNG** nối với CRM `lead_store` của sale/admin (xem mục D).

---

## A) ADMIN — Trạng thái từng module

Quy ước: ✅ Hoạt động (đủ FE+BE, không cần dịch vụ ngoài) · ⚙️ Cần cấu hình (đủ code, cần key/dịch vụ ngoài) · ❌ Chưa xong

| # | Module (menu admin) | Router backend | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | Tổng quan (`/`) | `admin.py` `/admin/overview` | ✅ | Số liệu tổng hợp từ các store JSON. |
| 2 | Điều hành / Manager command center (`/manager`) | `manager.py` `/admin/manager/*` | ✅ | Tổng hợp lead/inventory/commission nội bộ. |
| 3 | Live Match (`/live`) | `match.py` + `ws_match`/`ws_presence` | ⚙️ | Ghép cặp + presence + WebSocket chạy ngay. **Tạo link Google Meet cần `GOOGLE_WORKSPACE_REFRESH_TOKEN`**; thiếu → fallback "sale sẽ gọi điện". |
| 4 | Khách hàng / CRM (`/customers`) | `crm.py` (`admin_router`) | ✅ | Danh sách, lọc, sửa khách, gán sale, **xóa hàng loạt** (`/admin/crm/leads/bulk-delete`), gán care. Dùng `lead_store`. |
| 4a | Nhập đa nguồn nhiều tab (`/import`) | `admin_import.py` | ⚙️ một phần | **Parse file CSV/Excel + commit: ✅ chạy offline.** **Parse Google Sheet (`/google-sheet/parse`) cần Google Workspace OAuth đã Connect.** |
| 4b | Customer 360 (`/customers/[id]`) | `customer_360.py` `/crm/leads/{id}/profile-360` | ✅ | Hồ sơ 360 + care feed (`/care`). Dùng Claude để tổng hợp (đã có key). |
| 4c | Pipeline kanban (`/pipeline`) | `pipeline.py` `/crm/pipeline`, `/crm/leads/{id}/stage` | ✅ | Route critical đã được `main.py` kiểm tra khi khởi động. |
| 4d | Chấm điểm AI / insight (`/customers`) | `ai_crm.py` `/ai-crm/*` | ✅ | Scoring + insight + rescore hàng loạt bằng Claude (model haiku). Có key → chạy. |
| 5 | Hiệu suất Sale (`/customers/performance`) | `crm.py` `/admin/crm/sales/performance`, `/ranking` | ✅ | Xếp hạng từ `sale_task_store`. |
| 6 | Người dùng (`/users`) | `admin.py` `/admin/users/*` | ✅ | CRUD user, cây giới thiệu (`/admin/referral-tree`). |
| 7 | Nhân sự / HR (`/hr`) | `admin_hr.py` `/admin/hr/*` | ✅ | Ma trận quyền theo vai trò + mục tiêu KPI (JSON store, tự seed mặc định). |
| 8 | Sale & Hoa hồng (`/sales`) | `admin_commission.py` `/admin/commission/*` | ✅ | Cấu hình 5 bậc hoa hồng + KPI lũy tiến + thưởng giới thiệu. JSON store có version/backup. |
| 9 | Tài chính (`/finance`) | `finance.py` `/admin/finance/*` | ✅ | Chi phí + doanh thu (doanh thu thật suy từ hoa hồng). Phân tích AI bằng Claude (có key). |
| 10 | Quỹ căn / Bảng hàng (`/inventory`) | `admin_inventory.py` + `inventory.py` | ✅ | CRUD quỹ căn, ghi `inventory_store` (persist + backup). Có seed 5 căn độc quyền. **Đồng bộ từ Google Sheet chủ đầu tư là tùy chọn (cần Google).** |
| 10a | Chính sách bán hàng + Phiếu tính giá | `sales_policy.py` `/admin/sales-policy/*`; `learning.py` `/quote`,`/policy-quote` | ✅ | Chính sách (thanh toán/chiết khấu/VAT) + sinh phiếu tính giá PDF. Service `pricing_policy.py` đọc `sales_policy_store` + `inventory_store`. |
| 11 | Tài liệu RAG / Learning (`/kb`) | `learning.py` `/learning/*` | ✅ | Upload tài liệu + index BM25 + hỏi đáp. **Đồng bộ từ Google Drive (`admin_drive_sync`) là tùy chọn (cần Google).** |
| 12 | Hộp thư đa kênh (`/inbox`) | `admin_inbox.py` `/admin/inbox/*` | ⚙️ | **Cần `CHATWOOT_API_TOKEN`.** Thiếu → trả `configured:false` + hướng dẫn (không 500); chat web nội bộ vẫn chạy. |
| 13 | AI Marketing (`/marketing`) | `admin_marketing.py` + `marketing_pipeline.py` | ✅ | Chiến dịch đa kênh + dây chuyền sản xuất nội dung AI (Claude, có key). Gửi đi kênh thật mới cần token kênh. |
| 14 | Đội Sale AI (`/crew`) | `ai_sales.py` `/admin/ai-sales/*` **và** `crew.py` `/admin/crew/*` | ✅ (roster) / ⚙️ (CrewAI) | **Roster 1000 sale AI + tự gán + run-care: ✅ chạy bằng Claude.** **Lớp multi-agent CrewAI (`crew.py`) mặc định TẮT** (`CREW_ENABLED=false`); thiếu thư viện/cờ → fallback heuristic, không crash. |
| 15 | Automation (`/automation`) | `admin_automation.py` `/admin/automation/*` | ⚙️ | **Cần `N8N_API_KEY` + n8n self-host.** Thiếu → `configured:false` + hướng dẫn (HTTP 200). |
| 16 | Cấu hình / Integrations + API Keys (`/settings`) | `integrations.py` `/admin/integrations/*`, `api_keys.py` `/admin/api-keys/*` | ✅ | Quản lý tích hợp + API keys nội bộ (JSON store). Bản thân trang chạy; trạng thái từng tích hợp phản ánh việc đã điền key chưa. |
| 17 | Nền tảng / Health (`/platforms`) | `health.py` + `admin.py` `/admin/platforms/health` | ✅ / ⚙️ | Health-check nội bộ ✅. Ping các nền tảng vệ tinh (n8n/Dify/bot/chat) hiển thị "đỏ" cho tới khi các dịch vụ đó được dựng & cấu hình. |
| + | Call Center / Tổng đài (Stringee) | `call.py` `/crm/call/*` + `/webhook/stringee/*` | ⚙️ | **Cần `STRINGEE_API_KEY_SID` + `SECRET` + số tổng đài.** Thiếu → `/crm/call/*` trả 503, nút Gọi ẩn trên FE. |
| + | Tích hợp Dify (bộ não RAG mới) | `integrations.py` + `dify_client.py` | ⚙️ | **Cần `DIFY_API_URL` + `DIFY_API_KEY`.** Thiếu → chatbot tự fallback Claude trực tiếp (không crash). |
| + | OpenClaw God-Mode (trợ lý CEO) + MCP `/mcp` | `openclaw_bridge.py`, `openclaw_mcp.py` | ⚙️ | **Cần `OPENCLAW_GOD_TOKEN`.** Thiếu → mọi `/openclaw/*` trả 403 (fail-closed). |

**Kết luận khối A:** Không có module nào ở trạng thái ❌ "chưa xong" về code. 11/17 menu chạy được ngay; phần còn lại là ⚙️ chờ điền key.

---

## B) TÀI KHOẢN SALE — dashboard `/agent` (apps/web)

| Tính năng sale | Trang FE | Endpoint backend | Trạng thái | Đồng bộ với admin? |
|---|---|---|---|---|
| CRM khách của sale | `/agent/crm` | `/sale/leads*`, `/sale/leads/{id}`, `/contact-log` | ✅ | **CÓ — chung `lead_store`.** Sale chỉ thấy khách được gán (`list_leads_for_sale(user.id)`); admin thấy tất cả (`list_all_leads`). |
| KPI / nhiệm vụ ngày | `/agent` | `/sale/tasks/today`, `/check-in`, `/performance/me`, `/leaderboard` | ✅ | CÓ — chung `sale_task_store`; bảng xếp hạng admin & sale cùng nguồn. |
| Bảng hàng / Quỹ căn | `/agent/inventory` | `/inventory/{slug}/units` | ✅ | **CÓ — chung `inventory_store`** với admin (admin sửa → sale thấy). |
| Phiếu tính giá / Chính sách | (learning) | `/learning/policy-quote`, `/learning/sales-policy` | ✅ | **CÓ — chung `sales_policy_store` + `inventory_store`** với admin. |
| Hoa hồng | `/agent/commission` | `/sale/commission/*` (`sale_router`) | ✅ | CÓ — cùng cấu hình hoa hồng admin đặt (`commission_config_store`). |
| Referral / Giới thiệu | `/agent/referrals` | `/me/referrals` | ✅ | CÓ — cây giới thiệu chung (`user_store`, mã ref). |
| Live Match (sale nhận khách) | `/agent/live` | `/sale/match/incoming`, `/match/{id}/accept` + WS | ⚙️ | Ghép cặp ✅; **link Meet cần Google Workspace token** (xem A#3). |
| Learning Center | `/agent/learning` | `/learning/documents*`, `/learning/ask`, `/search` | ✅ | CÓ — chung kho tài liệu admin upload. |
| Đặt lịch / Bookings | `/agent/bookings` | `/bookings*` (`me_router`) | ✅ | CÓ — chung `booking_store`. |
| Click-to-call | (trong CRM) | `/crm/call/*` | ⚙️ | Cần Stringee (xem A). |

**Kết luận khối B:** Dashboard sale dùng CHUNG hầu hết store với admin → **đồng bộ thật**. Sale bị giới hạn đúng phạm vi (chỉ khách được gán, không tự đổi người phụ trách — `crm.py` loại bỏ `assigned_sale_id` khi sale tự sửa). Chỉ 2 điểm phụ thuộc cấu hình ngoài: Live Match (Meet) và Click-to-call (Stringee).

---

## C) TÀI KHOẢN KHÁCH — cổng `www` / `/client` (apps/web)

| Tính năng khách | Trang FE | Nguồn dữ liệu / endpoint | Trạng thái |
|---|---|---|---|
| Chatbot tư vấn | `/client/chat` (`ChatFull`) | `POST /agent/chat` → `sales_agent.py` | ✅ chạy bằng Claude (có key) + retrieval BM25. **Dify là tùy chọn** — có Dify thì trả lời từ Dify, không có thì fallback Claude (không crash). |
| Bảng hàng / Quỹ căn | `/client` | `fetchInventory` → `/inventory/{slug}/units` | ✅ **Chung `inventory_store` với admin** → khách thấy bảng hàng admin cập nhật. |
| So sánh căn hộ | `/client/compare` | `fetchInventory` | ✅ cùng nguồn inventory. |
| Phiếu tính giá / Pricing | `/client/pricing` (`PricingCalculator`) | `fetchInventory` + tính client-side | ✅ giá lấy từ inventory chung. |
| Công cụ vay / Loan | `/client/loan` | tính toán client-side | ✅ độc lập, không phụ thuộc dịch vụ ngoài. |
| Live Match | `/client/live` (`LiveMatchBanner`/`MeetJoinCard`) | `/match/request` + WS | ⚙️ ghép cặp ✅; **link Meet cần Google** (fallback gọi điện). |
| Đặt lịch xem nhà | `/client/booking/new` | `createBooking` → `/bookings` | ✅ ghi `booking_store`; nếu có `referral_code` → tự gán sale upline. |
| Yêu thích / Hồ sơ | `/client/favorites`, `/client/profile` | `/me/favorites` | ✅ |

**Kết luận khối C:** Cổng khách chạy được phần lõi (chatbot, bảng hàng, so sánh, vay, đặt lịch) ngay với cấu hình hiện tại. Hai điểm cần cấu hình: Meet link (Google) cho Live Match. Chatbot nâng cấp chất lượng khi bật Dify.

---

## D) ĐIỂM ĐỒNG BỘ DỮ LIỆU (Admin ↔ Sale ↔ Khách)

| Dòng dữ liệu | Đã đồng bộ (dùng chung store/API) | Chưa đồng bộ / Cảnh báo |
|---|---|---|
| **Bảng hàng / Quỹ căn** | ✅ `inventory_store` dùng chung cho admin (ghi), sale (`/agent/inventory`) và khách (`/client`). Admin sửa → sale & khách thấy ngay. | — |
| **Chính sách giá + phiếu tính giá** | ✅ `sales_policy_store` + `inventory_store` dùng chung cho admin, sale, khách. | — |
| **Hoa hồng** | ✅ `commission_config_store` admin đặt → sale đọc qua `/sale/commission`. | — |
| **Lead/Khách (CRM)** | ✅ `lead_store` dùng CHUNG cho admin (`/admin/crm/*`) và sale (`/sale/*`). Khách tạo từ **đặt lịch** (`/bookings`) và **Live Match** đi vào luồng gán sale. | ⚠️ **Endpoint công khai `/leads` (`leads.py`) dùng store in-memory `_LEADS` RIÊNG, KHÔNG nối `lead_store`.** Đây là endpoint MVP cũ (web `lib/api.ts → fetchLeads/createLead`). Lead tạo qua đường này **không hiện trong CRM sale/admin** và mất khi restart. Cần thống nhất về `lead_store`. |
| **Chatbot → Lead** | — | ⚠️ `/agent/chat` (`sales_agent.py`) hiện **không tự tạo lead** vào `lead_store`. Hội thoại chatbot web chưa tự đẩy thành khách trong CRM (chỉ trả lời tư vấn). |
| **Live Match** | ✅ `match_store` + `presence` dùng chung; sale online nhận invite realtime qua WS, admin xem `/admin/match/*`. | Link Meet phụ thuộc Google (không phải vấn đề đồng bộ store). |
| **Hội thoại đa kênh** | `conversation_store` nội bộ ✅ | ⚙️ Hợp nhất kênh ngoài (Zalo/FB/web) vào Customer 360 cần Chatwoot. |

**Tóm tắt D:** Trục Admin–Sale–Khách đã đồng bộ thật ở 3 trụ cột quan trọng nhất — **bảng hàng, chính sách giá, hoa hồng** — và ở CRM lead cho các lead đi qua `lead_store`. **Hai khe hở cần xử lý:** (1) endpoint `/leads` in-memory tách rời; (2) chatbot chưa tự sinh lead vào CRM.

---

## E) DANH SÁCH "CẦN LÀM ĐỂ THÔNG HẾT"

Chỉ là **cấu hình env/dịch vụ** (code đã sẵn) để chuyển ⚙️ → ✅:

1. **Live Match có link Google Meet** → đặt `GOOGLE_WORKSPACE_REFRESH_TOKEN` (hoặc dùng luồng "Connect Workspace" trên admin để lấy & lưu token). Chưa có → vẫn chạy nhưng fallback "sale gọi điện".
2. **Đăng nhập Google (admin/web)** → `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` + redirect URI (xem `docs/google-signin-setup.md`). Thiếu → endpoint Google trả 503, email+mật khẩu vẫn đăng nhập.
3. **Import từ Google Sheet + đồng bộ Drive (RAG)** → cần Google Workspace đã Connect (dùng chung token ở mục 1). Import file CSV/Excel thì KHÔNG cần.
4. **Hộp thư đa kênh (Chatwoot)** → `CHATWOOT_API_TOKEN` (+ `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`). Dựng Chatwoot self-host trước.
5. **Call Center (Stringee)** → `STRINGEE_API_KEY_SID` + `STRINGEE_API_KEY_SECRET` + `STRINGEE_FROM_NUMBER` + cấu hình webhook về `https://api.../webhook/stringee/*`.
6. **Automation (n8n)** → `N8N_API_KEY` (+ `N8N_API_URL`) và dựng n8n self-host; import các workflow trong `apps/agent-engine/n8n-workflows/`.
7. **Chatbot RAG nâng cao (Dify)** → `DIFY_API_URL` + `DIFY_API_KEY` (+ dataset key nếu cần). Tùy chọn — không có vẫn chạy bằng Claude.
8. **Đội Sale AI lớp CrewAI** → `CREW_ENABLED=true` + cài `requirements-crew.txt`. Tùy chọn — roster + auto-gán đã chạy không cần CrewAI.
9. **Telegram alert/briefing sale + bot CEO** → `TELEGRAM_BOT_TOKEN`, `OPENCLAW_TELEGRAM_BOT_TOKEN`, `OPENCLAW_CEO_CHAT_ID`.
10. **OpenClaw God-Mode + MCP `/mcp`** → `OPENCLAW_GOD_TOKEN` (`openssl rand -hex 32`); thêm `RAILWAY_API_TOKEN`, `ANTHROPIC_ADMIN_KEY` cho điều khiển nền tảng/chi phí.
11. **Gửi email (announce/email)** → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
12. **Bền dữ liệu (Postgres)** → `DATABASE_URL`. Thiếu → chạy JSON thuần (mất dữ liệu khi reset volume; dual-write tắt).

**Hai việc CODE (ngoài cấu hình) nên xử lý để đồng bộ trọn vẹn — mục D:**
- Thống nhất endpoint công khai `/leads` (`leads.py`) ghi vào `lead_store` thay vì `_LEADS` in-memory.
- Cho `/agent/chat` tự tạo/nâng lead vào `lead_store` khi khách để lại thông tin (để chatbot → CRM liền mạch).

---

*Báo cáo dựa trên đọc trực tiếp mã nguồn (`main.py` `_ROUTER_SPECS`, `nav-items.ts`, `crm.py`, `leads.py`, `inventory.py`, `sales_policy.py`, `pricing_policy.py`, `match_service.py`, `sales_agent.py`, `settings.py`, `.env`). Không suy đoán ngoài code.*
