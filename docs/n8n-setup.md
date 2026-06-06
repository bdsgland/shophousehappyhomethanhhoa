# Hướng dẫn cài đặt 3 Workflow n8n + Telegram Bot cho ELC

Tài liệu này hướng dẫn anh **tự** tạo Telegram Bot, import 3 workflow vào n8n và
bật chạy. Tổng thời gian ~15 phút.

3 workflow:

| File JSON | Tên trong n8n | Khi nào chạy |
|---|---|---|
| `apps/agent-engine/n8n-workflows/01-hot-lead-alert.json` | ELC — 01 Hot Lead Alert | Khi có booking mới (FastAPI gọi) |
| `apps/agent-engine/n8n-workflows/02-commission-calculator.json` | ELC — 02 Commission Calculator | Khi deal đóng (FastAPI gọi) |
| `apps/agent-engine/n8n-workflows/03-daily-briefing.json` | ELC — 03 Daily Briefing | 7h sáng mỗi ngày (tự động) |

> ⚠️ **Lưu ý bảo mật:** KHÔNG dán bot token vào file code/JSON. Token chỉ nhập vào
> **Credential của n8n** và **biến môi trường Railway**. File JSON chỉ chứa
> *tham chiếu* tới credential (`REPLACE_TELEGRAM_CREDENTIAL_ID`).

---

## Bước 1 — Tạo Telegram Bot qua @BotFather (~3 phút)

1. Mở Telegram, tìm **@BotFather** → bấm **Start**.
2. Gõ lệnh `/newbot`.
3. Đặt **tên hiển thị**: `ELC Sale Bot`.
4. Đặt **username** (phải kết thúc bằng `bot`): `elc_sale_bot`
   - Nếu trùng, thử `elc_sale_alert_bot`, `elc_sales_bot`… và **ghi nhớ username thực tế**.
5. BotFather trả về **bot token** dạng:
   ```
   123456789:ABCdEfGhIJKlmNoPQRsTuVwXyz1234567890
   ```
   👉 **Copy token này**, dùng ở Bước 2. (Lỡ mất → gõ `/token` lấy lại.)
6. (Tuỳ chọn) `/setdescription`, `/setuserpic` để bot đẹp hơn.

> Nếu username bot KHÁC `elc_sale_bot`, đặt thêm env
> `TELEGRAM_BOT_USERNAME=<username_thực_tế>` ở Railway để link liên kết đúng.

---

## Bước 2 — Thêm token vào n8n Credentials + Railway env (~3 phút)

### 2a. Credential trong n8n
1. Vào `https://n8n.eurowindowlightcity.net` → **Credentials** → **New**.
2. Chọn loại **Telegram API**.
3. Đặt tên đúng: **`ELC Sale Bot`** (3 workflow tham chiếu tên này).
4. Dán **bot token** ở Bước 1 → **Save**.

### 2b. Biến môi trường n8n (Settings → Variables hoặc env của container n8n)
| Biến | Giá trị |
|---|---|
| `ELC_API_URL` | `https://api.eurowindowlightcity.net` |
| `INTERNAL_WEBHOOK_TOKEN` | một chuỗi bí mật (vd `openssl rand -hex 24`) — **phải trùng** env backend |
| `MANAGER_TELEGRAM_CHAT_ID` | chat_id của manager/admin (xem cách lấy bên dưới) |
| `ADMIN_TELEGRAM_CHAT_ID` | chat_id admin nhận tổng kết briefing |
| `ANTHROPIC_API_KEY` | API key Claude (cho workflow Daily Briefing) |

> **Lấy chat_id cá nhân:** nhắn cho bot 1 tin bất kỳ, rồi mở
> `https://api.telegram.org/bot<token>/getUpdates` → tìm `"chat":{"id": ... }`.

### 2c. Biến môi trường Railway (service `agent-engine`)
| Biến | Giá trị |
|---|---|
| `TELEGRAM_BOT_TOKEN` | bot token Bước 1 |
| `TELEGRAM_BOT_USERNAME` | `elc_sale_bot` (hoặc username thực tế) |
| `INTERNAL_WEBHOOK_TOKEN` | **trùng** với giá trị đặt ở n8n |
| `PLATFORM_N8N_URL` | `https://n8n.eurowindowlightcity.net` (đã mặc định) |

> Đặt xong env trên Railway → **Redeploy** service `agent-engine`.

---

## Bước 3 — Import 3 workflow JSON vào n8n (~3 phút)

Với **từng** file trong `apps/agent-engine/n8n-workflows/`:

1. n8n → góc phải **⋯ (More)** → **Import from File…** (hoặc nút **+** → *Import from File*).
2. Chọn file `01-hot-lead-alert.json` → workflow hiện ra.
3. Mở các node **Telegram** (viền đỏ "credential") → chọn lại credential **ELC Sale Bot**.
4. **Save**.
5. Lặp lại cho `02-commission-calculator.json` và `03-daily-briefing.json`.

**Node đang tắt sẵn (disabled) — bật khi cần:**
- WF01: node *Email backup* — bật nếu muốn email dự phòng khi Telegram lỗi (cần credential SMTP).
- WF02: node *Google Sheets Log* — bật sau khi nối credential Google Sheets + điền `REPLACE_GOOGLE_SHEET_ID`.

---

## Bước 4 — Activate cả 3 workflow (~1 phút)

Mở từng workflow → gạt công tắc **Active** (góc trên phải) sang **ON**.

- WF01 & WF02: webhook chỉ "sống" khi workflow Active. URL production:
  - `https://n8n.eurowindowlightcity.net/webhook/hot-lead-alert`
  - `https://n8n.eurowindowlightcity.net/webhook/commission-calc`
- WF03: lịch cron `0 7 * * *` (giờ VN) chỉ chạy khi Active.

---

## Bước 5 — Test thực tế (~5 phút)

### 5.1. Sale liên kết Telegram
1. Sale đăng nhập web → vào **`/agent/profile`** → mục **Liên kết Telegram**.
2. Bấm **Tạo link liên kết** → bấm nút mở bot → trong Telegram bấm **Start**.
3. Quay lại trang, trạng thái chuyển **"Đã liên kết ✅"**.

> Kỹ thuật: FE gọi `POST /me/telegram/link-token` lấy token + deep-link
> `https://t.me/<bot>?start=<token>`. Khi sale bấm Start, bot/n8n gọi
> `POST /me/telegram/link` với `{verification_token, chat_id}` → backend lưu chat_id.
> (Có thể thêm 1 workflow nhỏ bắt sự kiện `/start` của bot để tự gọi endpoint này;
> hoặc tạm thời nhập chat_id thủ công qua API trong giai đoạn test.)

### 5.2. Test Hot Lead Alert
Tạo booking test (qua app) **hoặc** giả lập bằng curl:
```bash
curl -X POST https://api.eurowindowlightcity.net/webhooks/internal/booking-created \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: $INTERNAL_WEBHOOK_TOKEN" \
  -d '{
    "lead_id": "test-lead-1",
    "unit_id": "ELC-A1-1205",
    "unit_summary": "Căn 2PN, 75m², view hồ, 3.2 tỷ",
    "booking_time": "2026-06-08 10:00",
    "sale_id": "<USER_ID_CỦA_SALE_ĐÃ_LIÊN_KẾT>",
    "conversation_url": "https://chat.eurowindowlightcity.net/app/accounts/1/conversations/123",
    "ai_score": 92,
    "ai_summary": "Khách hỏi vay 70%, có ý đặt cọc"
  }'
```
→ Sale nhận tin Telegram ngay. Sau 5 phút nếu chưa bấm "đã liên hệ" → manager nhận cảnh báo.
(Đánh dấu đã liên hệ: `POST /leads/{lead_id}/contacted`.)

### 5.3. Test Commission
```bash
curl -X POST https://api.eurowindowlightcity.net/webhooks/internal/deal-closed \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: $INTERNAL_WEBHOOK_TOKEN" \
  -d '{
    "deal_id": "test-deal-1",
    "deal_amount": 3200000000,
    "sale_id": "<USER_ID_SALE>",
    "sale_monthly_volume_before": 8500000000
  }'
```
→ n8n tính 5 bậc, lưu về `/commissions/distribute`, gửi Telegram cho những người đã liên kết.

### 5.4. Test Daily Briefing
Không cần chờ 7h: mở workflow **03 Daily Briefing** → bấm **Execute Workflow**.
→ Admin nhận tổng kết; mỗi sale đã liên kết nhận briefing do Claude soạn.

---

## Phụ lục — Công thức hoa hồng 5 bậc (node "Tính hoa hồng" WF02)

- `commission_pool = deal_amount × 4%`
- Ekip công ty: **20%** pool · Giám đốc: **10%** · Trưởng phòng: **5%** · Sale Leader: **15%**
- Sale Frontline (lũy tiến theo *monthly volume sau khi cộng deal này*):

| Monthly volume | % frontline |
|---|---|
| < 5 tỷ | 50% |
| 5–10 tỷ | 55% |
| 10–15 tỷ | 60% |
| 15–20 tỷ | 62% |
| ≥ 20 tỷ | 65% |

> Sửa công thức: mở node **Tính hoa hồng** (Code node) trong WF02.

## Phụ lục — Thêm nút bấm Inline trên Telegram (tuỳ chọn)

Workflow gửi link Chatwoot dạng markdown `[Mở Chatwoot](url)` cho gọn & chắc chắn.
Nếu muốn nút bấm thật: mở node Telegram → **Reply Markup** = *Inline Keyboard* →
thêm button **URL** trỏ tới `{{ $('Webhook').item.json.body.conversation_url }}`.
