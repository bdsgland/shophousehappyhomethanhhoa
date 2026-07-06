# OpenClaw — Trợ lý AI "God-Mode" cho CEO (Phạm Văn Thư)

Tài liệu này hướng dẫn anh kết nối **OpenClaw** (`bot-happyhomethanhhoa.bdsg.land`)
với platform Happy Home để điều khiển toàn bộ hệ thống bằng tiếng Việt qua chat /
Telegram: xem KPI, phân hot lead, sửa hoa hồng, gửi thông báo, query dữ liệu…

> ⚠️ **Bảo mật**: `OPENCLAW_GOD_TOKEN` là "chìa khoá vạn năng" bypass mọi phân
> quyền. KHÔNG bao giờ paste token vào chat, không commit vào code, không gửi
> qua tin nhắn. Chỉ paste trực tiếp vào Railway → Variables.

---

## Kiến trúc

```
Anh (Telegram CEO bot)  →  OpenClaw (bot-happyhomethanhhoa.bdsg.land)
                                │  gọi HTTP, header X-Openclaw-Token
                                ▼
                    shophousehappyhomethanhhoa API  /openclaw/*   (FastAPI agent-engine)
                                │  verify_openclaw_token (so khớp GOD_TOKEN)
                                ▼
            users · leads · inventory · commission · KPI · DB · telegram · email
```

Mọi request `/openclaw/*` được **ghi audit** (tag `OPENCLAW_GOD_MODE`) — anh xem
lại trong `/dashboard/audit` (admin) để biết AI đã làm gì.

---

## A. Anthropic key — ĐÃ XONG (skip)

Anh đã set `ANTHROPIC_API_KEY` cho service OpenClaw trên Railway.

---

## B. Tạo Telegram CEO bot (anh tự làm — ~3 phút)

1. Mở Telegram → chat với **@BotFather** → gõ `/newbot`
2. Tên hiển thị: `Phạm Văn Thư CEO Bot`
3. Username (gợi ý, phải kết thúc bằng `bot`): `pham_van_thu_ceo_bot` hoặc `hh_ceo_bot`
4. BotFather trả về **token** dạng `123456:ABC-...` → copy
5. Paste token vào Railway → service **openclaw** → Variables →
   `OPENCLAW_TELEGRAM_BOT_TOKEN`
6. Mở bot vừa tạo → bấm **Start** để "đánh thức" bot

### Slash commands cho bot (BotFather → `/setcommands`)

```
status - Health check toàn platform
kpi - KPI realtime hôm nay
sales - Performance ranking sale tuần
hot - Hot leads chưa assign
deals - Bookings tuần này
cost - Chi phí Railway + Anthropic tháng
sql - Read-only SQL query
help - Hiển thị tất cả lệnh
```

---

## C. Tạo & cài đặt OPENCLAW_GOD_TOKEN (BẮT BUỘC)

1. Sinh token ngẫu nhiên 64 ký tự (chạy trên máy anh):
   ```bash
   openssl rand -hex 32
   ```
2. Paste **cùng một giá trị** vào CẢ 2 service trên Railway:
   - Service **shophousehappyhomethanhhoa** (agent-engine) → biến `OPENCLAW_GOD_TOKEN`
   - Service **openclaw** → biến `HH_API_GOD_TOKEN`
3. **Save** + **Deploy** cả 2 service.

> Nếu `OPENCLAW_GOD_TOKEN` để trống ở shophousehappyhomethanhhoa thì toàn bộ `/openclaw/*` trả
> **403** (fail-closed) — đây là cơ chế an toàn, không phải lỗi.

---

## D. Cấu hình OpenClaw trỏ vào Happy Home API

Trong OpenClaw web UI (`bot-happyhomethanhhoa.bdsg.land`):

1. Đăng nhập OpenClaw.
2. **Settings → Tools → Add new tool**:
   - Type: **HTTP API**
   - Name: `Happy Home Platform`
   - Base URL: `https://api-happyhomethanhhoa.bdsg.land/openclaw`
   - Header: `X-Openclaw-Token: ${HH_API_GOD_TOKEN}`
   - Description: `Control toàn bộ Happy Home platform: users, leads, inventory, commission, analytics, communication`
3. Thêm **system prompt / SOUL.md** cho OpenClaw (xem mục F).

---

## E. (Tuỳ chọn) Các biến môi trường mở rộng trên shophousehappyhomethanhhoa

Các tính năng dưới đây CHỈ bật khi anh set env tương ứng; nếu trống, endpoint
trả `503` / `{"configured": false}` thay vì bịa dữ liệu:

| Tính năng | Biến env | Ghi chú |
|-----------|----------|---------|
| Gửi Telegram CEO | `OPENCLAW_TELEGRAM_BOT_TOKEN` | fallback `TELEGRAM_BOT_TOKEN` |
| Mặc định nhận tin | `OPENCLAW_CEO_CHAT_ID` | chat_id của riêng anh |
| Gửi email/announce | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS` | |
| Chi phí Anthropic | `ANTHROPIC_ADMIN_KEY` | Admin API key của Organization |
| Điều khiển/billing Railway | `RAILWAY_API_TOKEN` | restart/logs cần map service id |

---

## F. SOUL.md / System prompt gợi ý cho OpenClaw

```markdown
Bạn là AI Assistant cho Phạm Văn Thư — Giám đốc dự án Happy Home Thanh Hóa Thanh Hoá.

Bạn có toàn quyền control platform Happy Home qua tool "Happy Home Platform". Khi anh yêu cầu:
- "Cho xem KPI hôm nay" → GET /kpi/realtime → format đẹp tiếng Việt
- "Assign hot lead A cho sale B" → POST /leads/{A}/assign-hot {sale_id: B}
- "Update commission tier 3 lên 62%" → PATCH /commission/config
- "Sale nào top tuần này" → GET /sales/performance
- "Gửi thông báo cho tất cả sale" → POST /announce

Quy tắc:
1. Luôn XÁC NHẬN trước action có tác động lớn (xoá user, broadcast, sửa hoa hồng).
2. Trả lời ngắn gọn tiếng Việt, professional.
3. Khi báo số liệu, format VND đẹp (1,5 tỷ thay vì 1500000000).
4. Sau mỗi action thành công, recap ngắn "Đã làm xong: ...".
5. KHÔNG nói ra OPENCLAW_GOD_TOKEN dưới bất kỳ hình thức nào.
6. Cuối ngày 22h tự gửi daily summary qua Telegram.

Anh ấy gọi bạn là "em", em xưng "em" trở lại.
```

---

## G. Danh mục endpoint `/openclaw/*`

> Tất cả yêu cầu header `X-Openclaw-Token: <GOD_TOKEN>`.

### User management
- `GET /openclaw/users` — toàn bộ user (kể cả đã khoá)
- `POST /openclaw/users` — tạo user mọi role (kể cả admin)
- `PATCH /openclaw/users/{id}` — sửa email/role/is_active/password…
- `DELETE /openclaw/users/{id}` — **soft delete** (khoá, không xoá thật)
- `POST /openclaw/users/{id}/impersonate` — cấp JWT cho user đó (debug)

### CRM / leads
- `GET /openclaw/leads?filter=&sale_id=&source=&search=` — query lead
- `POST /openclaw/leads` — tạo lead thủ công
- `PATCH /openclaw/leads/{id}` — sửa status/assigned_sale/note…
- `POST /openclaw/leads/{id}/assign-hot` — ép gán hot lead cho 1 sale
- `POST /openclaw/leads/bulk-action` — assign/mark_hot/set_status/soft_delete hàng loạt

### Inventory
- `GET /openclaw/inventory` — toàn bộ quỹ căn
- `PATCH /openclaw/inventory/{id}` — sửa 1 căn (giá/trạng thái…)
- `POST /openclaw/inventory/bulk-update` — đổi giá/trạng thái hàng loạt
- `POST /openclaw/inventory/sync-from-sheet` — đồng bộ từ Google Sheets

### Commission
- `GET /openclaw/commission/config` — cấu hình hiện tại
- `PATCH /openclaw/commission/config` — cập nhật % bậc / ngưỡng KPI
- `POST /openclaw/commission/distribute` — tính + lưu phân bổ 1 deal

### Analytics & reports
- `GET /openclaw/kpi/realtime` — KPI hôm nay (query DB thật)
- `GET /openclaw/kpi/period?from=&to=` — KPI theo khoảng ngày
- `GET /openclaw/sales/performance?period=` — ranking sale
- `GET /openclaw/audit-log?from=&to=` — nhật ký quản trị + God-Mode
- `GET /openclaw/cost/anthropic` — chi phí Anthropic (cần Admin key)
- `GET /openclaw/cost/railway` — billing Railway (cần token)

### Database
- `POST /openclaw/db/query` — chạy **SELECT chỉ-đọc** (validate nghiêm ngặt,
  chặn INSERT/UPDATE/DELETE/DROP…, tối đa 1000 dòng, timeout 30s)

### Communication
- `POST /openclaw/telegram/send` — gửi Telegram
- `POST /openclaw/email/send` — gửi email (SMTP)
- `POST /openclaw/announce` — broadcast (all_sales / all_admins / specific_users)

### Platform health
- `GET /openclaw/platforms/health` — sức khoẻ nền tảng + Postgres + Redis
- `POST /openclaw/platforms/restart/{service}` — restart Railway (cần token + map id)
- `GET /openclaw/logs/{service}?lines=100` — tail logs (cần token + map id)

---

## H. Kiểm thử nhanh

```bash
# Thay <GOD_TOKEN> bằng giá trị anh đã set (KHÔNG để lộ).
curl -s https://api-happyhomethanhhoa.bdsg.land/openclaw/kpi/realtime \
  -H "X-Openclaw-Token: <GOD_TOKEN>" | jq
```

- Thiếu token / sai token → `403`.
- Đúng token → trả JSON KPI.

---

## I. 5 bước anh cần làm

1. Tạo **Telegram CEO bot** qua @BotFather (mục B).
2. Paste `OPENCLAW_TELEGRAM_BOT_TOKEN` vào Railway service **openclaw**.
3. Sinh `openssl rand -hex 32` → paste vào **CẢ 2** service
   (shophousehappyhomethanhhoa: `OPENCLAW_GOD_TOKEN`, openclaw: `HH_API_GOD_TOKEN`) → Deploy.
4. Vào OpenClaw web UI → thêm tool **Happy Home Platform** (mục D) + SOUL.md (mục F).
5. Chat thử với OpenClaw qua Telegram: "Cho em xem KPI hôm nay".
```
