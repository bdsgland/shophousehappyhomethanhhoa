# n8n Sync Report — 2026-06-08

**Tổng cộng 34 workflow đã import + activate trên `https://n8n.eurowindowlightcity.net`.**

| # | Tên workflow | n8n ID | Trigger | Status |
|---|---|---|---|---|
| 01 | 🔥 Hot Lead Alert - Booking → Telegram | `60P9uBUuiitfqWUH` | webhook `hot-lead-alert` | ✅ active |
| 02 | 💰 Commission Calculator - 5 Tier | `7hzJlrtrfWS9pe7W` | webhook `commission-calc` | ✅ active |
| 03 | 📅 Daily Briefing - 7AM Sale | `oSTV0741PL0PFO3v` | cron `0 7 * * *` | ✅ active |
| 04 | 🎁 Welcome on Register | `6BapROhdCVKCGV9r` | webhook `welcome-register` | ✅ active |
| 05 | 🔔 Booking Reminder 24h | `nrtNVrWqK4jUfsh7` | cron `0 * * * *` | ✅ active |
| 06 | 💤 Re-engagement Silent 14d | `BbsAsCCRFGPebDFD` | cron `0 9 * * *` | ✅ active |
| 07 | 🛒 Cart Abandonment | `cM4F2KdH318jgPjy` | cron `0 10 * * *` | ✅ active |
| 08 | 📬 Customer Journey Drip | `jIPEbGtI2AcXGaC6` | webhook `register-drip` | ✅ active |
| 09 | 🎂 Birthday Greeting | `PvAgVl4bihqcXNh9` | cron `0 8 * * *` | ✅ active |
| 10 | 📊 Post-viewing Feedback | `o0hq15s2txTLUsGo` | cron `0 9 * * *` | ✅ active |
| 11 | 📈 Sale Weekly Report | `AiRI6mZoiHgEOxCg` | cron `0 8 * * 1` | ✅ active |
| 12 | ⏰ Sale Didn't Login 3d | `KJbxxk0aP3WIj6C3` | cron `0 10 * * *` | ✅ active |
| 13 | 🚨 Sale Escalation | `EPt6YHdG7Ac7OkY0` | webhook `sale-escalation` | ✅ active |
| 14 | 🎓 Training Completion Unlock | `aLs5JD3lj2jVolge` | webhook `training-complete` | ✅ active |
| 15 | 🏆 New Deal Congrats | `vL6RKNvyTZr42kgE` | webhook `deal-closed-team` | ✅ active |
| 16 | 📊 Admin Daily KPI | `rzaeDWRkOVz7Urpi` | cron `0 22 * * *` | ✅ active |
| 17 | 📦 Inventory Low Stock | `dB5E1LHXCjvsAQqu` | cron `0 8 * * *` | ✅ active |
| 18 | 💸 API Cost Monitor | `wTpotBjKq4RhYNmD` | cron `0 23 * * *` | ✅ active |
| 19 | 🩺 Health Monitor 6 Platforms | `X0xfHTgLUt0KdTkt` | cron `*/5 * * * *` | ✅ active |
| 20 | 💾 Backup Data Daily | `TB9bMfqp4NbJszg5` | cron `0 2 * * *` | ✅ active |
| 21 | 💬 Chatwoot Conversation Sync | `Z1U1R9VqhxgblvgP` | webhook `chatwoot-hot-lead` | ✅ active |
| 22 | 📚 Open-Notebook KB Sync | `AkZhD9yUpS7l5Wb8` | webhook `notebook-public-source` | ✅ active |
| 23 | 📱 Facebook Ads Lead | `hYNjBVHw5EQJYW8l` | webhook `fb-lead` | ✅ active |
| 24 | 📧 Email Inbound Router | `nSCdJvRjD9q8eCBY` | webhook `chatwoot-email-inbound` | ✅ active |
| 25 | 🎨 Auto-publish Facebook Post | `VWgokm6UwcKzjvOb` | cron `0 9 * * *` | ✅ active |
| 26 | 📱 Auto-publish Zalo OA | `natEm0YeEn4lo6D7` | cron `0 8,18 * * *` | ✅ active |
| 27 | 🎬 TikTok Caption Generator | `iDUSbvLOrPJdFBaJ` | cron `0 10 * * 1,3,5` | ✅ active |
| 28 | 📝 Blog SEO Auto | `8Q5PjQk5fhrcmngA` | cron `0 6 * * 1` | ✅ active |
| 29 | 🎯 Facebook Ads Daily Report | `jZpCDcZflFaVO5LZ` | cron `0 8 * * *` | ✅ active |
| 30 | 📊 Google Ads Performance | `XL11Xey2MDYhfjiQ` | cron `0 8 * * *` | ✅ active |
| 31 | 🔍 Competitor Price Monitor | `KtSOtJGC4MnG7xAH` | cron `0 7 * * *` | ✅ active |
| 32 | 📧 Email Marketing Campaign | `lwSw1IrjPzImUlR9` | webhook `marketing-campaign` | ✅ active |
| 33 | 🎪 Event Invitation Flow | `3PU3PXQ6sOJYRNLG` | webhook `event-create` | ✅ active |
| 34 | 🎁 Referral Reward | `pGeemLEZO0nTfuuq` | webhook `referral-first` | ✅ active |

## Webhook URLs cần paste vào Railway agent-engine env

```bash
# Webhook URLs cho FastAPI trigger workflows
N8N_HOT_LEAD_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/hot-lead-alert
N8N_COMMISSION_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/commission-calc
N8N_WELCOME_REGISTER_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/welcome-register
N8N_CUSTOMER_DRIP_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/register-drip
N8N_SALE_ESCALATION_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/sale-escalation
N8N_TRAINING_COMPLETE_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/training-complete
N8N_DEAL_CLOSED_TEAM_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/deal-closed-team
N8N_MARKETING_CAMPAIGN_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/marketing-campaign
N8N_EVENT_CREATE_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/event-create
N8N_REFERRAL_FIRST_WEBHOOK_URL=https://n8n.eurowindowlightcity.net/webhook/referral-first
```

## Webhook URLs cho external integration (paste vào Chatwoot / open-notebook / FB Lead Ads / SendGrid)

```bash
# Chatwoot → n8n: Settings → Integrations → Webhooks
CHATWOOT_HOT_LEAD_WEBHOOK=https://n8n.eurowindowlightcity.net/webhook/chatwoot-hot-lead
CHATWOOT_EMAIL_INBOUND_WEBHOOK=https://n8n.eurowindowlightcity.net/webhook/chatwoot-email-inbound

# Open-Notebook → n8n
NOTEBOOK_PUBLIC_SOURCE_WEBHOOK=https://n8n.eurowindowlightcity.net/webhook/notebook-public-source

# Meta Business Suite → n8n (FB Lead Ads webhook)
FB_LEAD_WEBHOOK=https://n8n.eurowindowlightcity.net/webhook/fb-lead
```

## Env variables n8n cần set (Settings → Environment variables HOẶC sửa biến môi trường Railway của service n8n)

### Bắt buộc (chạy workflow nội bộ)
```
ELC_API_URL=https://api.eurowindowlightcity.net
INTERNAL_WEBHOOK_TOKEN=<random hex 32 ký tự — đồng bộ với env backend agent-engine>
ANTHROPIC_API_KEY=<dùng lại key Railway của agent-engine>
ADMIN_EMAIL=info@raiholdings.vn
N8N_BLOCK_ENV_ACCESS_IN_NODE=false   # quan trọng — KHÔNG có cờ này thì $env không đọc được, workflow 02 sẽ lỗi như test
```

### Chatwoot
```
CHATWOOT_API_URL=https://chat.eurowindowlightcity.net
CHATWOOT_API_TOKEN=mjmruQEbfat58WRvT3rcXm9o
```

### Telegram (sau khi tạo bot qua @BotFather)
```
TELEGRAM_BOT_TOKEN=<paste vào n8n credential "ELC Sale Bot" thay cho REPLACE_TELEGRAM_CREDENTIAL_ID>
ADMIN_TELEGRAM_CHAT_ID=<chat_id của anh>
MANAGER_TELEGRAM_CHAT_ID=<chat_id manager>
SALES_TEAM_TELEGRAM_CHAT_ID=<chat_id group sale team>
MARKETING_TEAM_TELEGRAM_CHAT_ID=<chat_id group marketing>
```

### Marketing channels
```
# Facebook Page (workflow 25, 29)
FB_PAGE_ID=<page id>
FB_PAGE_ACCESS_TOKEN=<long-lived page token>
FB_ADS_ACCOUNT_ID=<ads account id, không có "act_" prefix>

# Zalo OA (workflow 26)
ZALO_OA_ACCESS_TOKEN=<OA access token>

# WordPress + Vercel (workflow 28)
WP_URL=https://blog.eurowindowlightcity.net
WP_API_TOKEN=<JWT token>
VERCEL_DEPLOY_HOOK=https://api.vercel.com/v1/integrations/deploy/<project>/<hook>

# SendGrid (workflow 32)
SENDGRID_API_KEY=<key>
SENDGRID_FROM_EMAIL=marketing@eurowindowlightcity.net

# Cloudflare R2 (workflow 20)
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_BUCKET=elc-backups
R2_API_TOKEN=<token>

# Google Ads (workflow 30) — n8n chỉ gọi proxy /admin/marketing/google-ads/yesterday
GOOGLE_ADS_CUSTOMER_ID=<account id, FastAPI lo OAuth>
```

### SMTP (cho tất cả email node — tạo credential trong n8n)
```
SMTP_HOST=<smtp server>
SMTP_PORT=587
SMTP_USER=no-reply@eurowindowlightcity.net
SMTP_PASS=<password>
```

## FastAPI endpoint cần backend implement (workflow đang gọi)

```
# Sales
GET    /admin/sales/active                        # workflow 03, 11
GET    /admin/sales/inactive-3d                   # workflow 12
GET    /admin/sales/{id}/weekly-stats             # workflow 11
POST   /admin/sales/{id}/upgrade-tier             # workflow 14
POST   /admin/sales/{id}/bonus                    # workflow 34

# Leads / Bookings
GET    /admin/leads/needs-followup?sale_id=...    # workflow 03
GET    /admin/leads/silent-14d                    # workflow 06
GET    /admin/leads/favorites-7d-no-booking       # workflow 07
GET    /admin/bookings/upcoming-24h               # workflow 05
GET    /admin/bookings/completed-yesterday        # workflow 10
GET    /leads/{lead_id}/contacted_at              # workflow 01
POST   /leads                                     # workflow 21, 23

# Users
GET    /admin/users/birthday-today                # workflow 09

# Commission / Deals
POST   /commissions/distribute                    # workflow 02
POST   /admin/leaderboard/update                  # workflow 15
POST   /admin/escalations                         # workflow 13

# Marketing
GET    /admin/units/hot-pick                      # workflow 25, 26, 27
GET    /admin/marketing/keywords/pool             # workflow 28
POST   /admin/marketing/posts/log                 # workflow 25
GET    /admin/marketing/google-ads/yesterday      # workflow 30
GET    /admin/marketing/competitor-prices         # workflow 31
POST   /admin/marketing/segments/preview          # workflow 32
POST   /admin/marketing/audience/match            # workflow 33
POST   /admin/marketing/campaigns/{id}/log        # workflow 32
POST   /admin/marketing/events/{id}/invites       # workflow 33

# Inventory / KPI / Cost
GET    /admin/inventory/low                       # workflow 17
GET    /admin/cost/anthropic-today                # workflow 18
GET    /admin/kpi/today                           # workflow 16

# Admin tools
POST   /admin/backup/trigger                      # workflow 20
POST   /admin/inbox/route                         # workflow 24
POST   /learning/documents                        # workflow 22
```

## Test results

- **Workflow 02 (Commission Calculator)** — mock test với deal 3.2 tỷ + monthly volume 8.5 tỷ:
  - ✅ Webhook nhận 200 "Workflow was started"
  - ✅ Code node "Tính hoa hồng" tính 5 tier OK
  - ❌ HTTP node "Lưu về FastAPI" lỗi `access to env vars denied` → **đây là rào cản chung của TẤT CẢ workflow**. Anh phải set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` trong env Railway của n8n service rồi redeploy, thì `{{ $env.VAR }}` mới đọc được.
  - Sau khi unblock, test lại workflow 02 sẽ thấy 5 tier được POST lên `/commissions/distribute` đúng format.

## ⚠️ TODO cho anh (theo độ ưu tiên)

### Mức 1 — bắt buộc để workflow chạy bất cứ thứ gì
1. Set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` trong Railway env của service n8n → Redeploy. **Đây là blocker chung.**
2. Set `ELC_API_URL`, `INTERNAL_WEBHOOK_TOKEN`, `ANTHROPIC_API_KEY` trong n8n env.
3. Paste 10 webhook URL ở mục "Railway agent-engine env" vào Railway service `RAI-ELC` → Redeploy.

### Mức 2 — bật từng nhóm
4. **Telegram:** tạo bot qua @BotFather → vào n8n Settings → Credentials → New → Telegram → paste bot token. Sau đó mở từng workflow có node Telegram (12 workflow), thay credential `REPLACE_TELEGRAM_CREDENTIAL_ID` bằng credential mới. Set `ADMIN_TELEGRAM_CHAT_ID`, `MANAGER_TELEGRAM_CHAT_ID`, `SALES_TEAM_TELEGRAM_CHAT_ID`, `MARKETING_TEAM_TELEGRAM_CHAT_ID`.
5. **SMTP:** tạo credential SMTP trong n8n. Sau đó vào từng email node (đang `disabled: true`) — gắn credential rồi enable.
6. **Chatwoot:** paste `CHATWOOT_API_URL` + `CHATWOOT_API_TOKEN` (token = `mjmruQEbfat58WRvT3rcXm9o` đã có). Setup webhook Chatwoot → /webhook/chatwoot-hot-lead + /webhook/chatwoot-email-inbound.

### Mức 3 — marketing
7. **Facebook Page/Ads:** lấy Page Access Token + Ads Account ID từ Meta Business Suite.
8. **Zalo OA:** đăng ký Zalo Official Account → lấy access token.
9. **WordPress + Vercel:** setup blog WP + Vercel deploy hook.
10. **SendGrid:** đăng ký tài khoản, verify sender, lấy API key.
11. **Cloudflare R2:** tạo bucket `elc-backups`, generate R2 token.
12. **Meta Lead Ads webhook:** Meta Business Suite → Instant Forms → cấu hình webhook https://n8n.eurowindowlightcity.net/webhook/fb-lead.

### Mức 4 — backend
13. Implement 30+ FastAPI endpoint ở mục "FastAPI endpoint cần backend implement" — đây là API surface mà n8n đang giả định có sẵn.

### Mức 5 — bảo mật
14. **REVOKE n8n API key** (`agent-import`, sub 73cb217f-...) ngay khi không cần bulk push nữa: vào n8n Settings → n8n API → Delete key. Key hết hạn tự nhiên `2026-06-15` nhưng tốt nhất revoke ngay.

---

Generated: 2026-06-08 by Cowork agent. Repo: `apps/agent-engine/n8n-workflows/04-34-*.json`.
