# Khảo sát CRM & Đề xuất lộ trình nâng cấp chuyên sâu

> Phạm vi: CHỈ khảo sát + đề xuất lộ trình (không sửa code). Mục tiêu: chốt làm gì TRƯỚC.
> Ngày: 10/06/2026 · Repo: `Agent-Proptech` (Next.js `apps/web` + `apps/admin`, FastAPI `apps/agent-engine`, 35 n8n workflows)

---

## A. CRM HIỆN CÓ

### A.1. CRM phía SALE — `apps/web/app/agent/crm/page.tsx`

Đã có giao diện CRM khá đầy đủ, chia 4 tab:

| Tab | Chức năng |
|-----|-----------|
| **Hôm nay** | KPI gauge (0–100), 3 thanh mục tiêu (khách mới / lượt liên hệ / cuộc hẹn), nút check-in, hàng đợi hot lead (`HotLeadQueue`, `TodayTasksCard`) |
| **Khách của tôi** | Bảng lead (`LeadTable`) + panel chi tiết (`LeadDetailPanel`): info, AI score, quick-action Gọi/Zalo/Log, edit status + note, lịch sử contact log |
| **Nhập danh bạ** | `ImportContactsTab` — upload CSV hoặc paste thô, preview, bulk import, chống trùng theo SĐT |
| **Bảng xếp hạng** | `LeaderboardTable` — rank, điểm TB tuần, khách thêm, hot nhận, deal chốt |

Component (`apps/web/components/agent/crm/`): `LeadTable`, `LeadDetailPanel`, `HotLeadQueue`, `TodayTasksCard`, `ContactLogModal`, `LeaderboardTable`, `ImportContactsTab`.

**Đã có:** danh sách lead + lọc/tìm kiếm, chi tiết + lịch sử tương tác, ghi contact log (6 kênh, 5 outcome), AI score hiển thị, KPI/check-in, leaderboard, quick-action Gọi/Zalo.
**Còn thiếu (phía sale):** Kanban/pipeline kéo-thả, bulk action, timeline đẹp, template tin nhắn, nhắc follow-up theo lịch.

### A.2. CRM phía ADMIN — `apps/admin/app/(dash)/`

| Trang | Chức năng |
|-------|-----------|
| `customers/` | Master view toàn bộ lead: lọc (status/sale/source/search), stats (tổng/hot/customer/conversion rate), export CSV, **auto-distribute hot lead**, reassign sale, mark hot, soft-delete |
| `customers/performance/` | Bảng xếp hạng sale theo `eligibility_score` + biểu đồ xu hướng lead |
| `sales/` | Danh sách sale, hoa hồng (duyệt/đánh dấu đã trả, 5 tier), cây giới thiệu |
| `conversations/` | Tab Chatbot Web (intent score, HOT badge) + tab Chatwoot (kênh, assignee, trạng thái) |
| `settings/` | `SalesPolicyTab`, `IntegrationsList`, `AuditLogTable`, `GoogleWorkspaceCard` |

**Còn thiếu (phía admin):** trang customer detail (timeline), pipeline view trực quan, segment builder, rule auto-assign cấu hình được, funnel/cohort analytics.

### A.3. Model dữ liệu lead/khách

Schema đồng bộ `apps/agent-engine/app/schemas/crm.py` ↔ `apps/web/lib/crm.ts`.

**Lead** — các trường thực tế: `id, name, phone, email, source, status, assigned_sale_id, imported_by_sale_id, ai_score, booking_count, contact_count, effective_contact_count, registered, last_contact_at, hot_marker_at, created_at, updated_at, note, days_since_contact (computed)`.

- `status` (vòng đời lead, KHÔNG phải pipeline deal): `cold → warm → hot → customer | lost`
- `source`: `imported, registered, referral, fb_ads, zalo, email, manual`

**ContactLog:** `id, lead_id, sale_id, channel (call/sms/zalo/facebook/email/inperson), note, outcome (no_answer/interested/not_interested/callback/booked), created_at`.

**KPI/Performance:** `SaleTaskDaily` (new_leads/contacts/meetings + score + check-in), `SalePerformance` (avg_daily_score, eligibility_score, rank).

**AI score hiện tại = công thức cứng** (`app/core/lead_store.py::compute_ai_score`), KHÔNG dùng LLM:
```
+20 nếu registered · +30 nếu có ≥1 booking · +10 nếu ≥5 contact hiệu quả
+5 nếu liên hệ <3 ngày · +5 nếu note >50 ký tự  (cap 100)
```

**Lưu trữ:** hiện chạy trên **JSON file** (`data/_runtime/*.json`, lock + atomic write). Schema PostgreSQL đã sẵn (`apps/agent-engine/app/db/models.py`: `users, leads, conversations, bookings, commissions, units` + migration `alembic/versions/`) nhưng **chưa migrate** — nhiều endpoint n8n còn trả mock (`app/api/n8n_stubs.py`).

**Thiếu trong model:** `tags/nhãn`, `next_followup_at` (chưa nối CRM), bảng `Deal` với stage riêng (proposal→negotiation→signed), audit trail thay đổi lead.

---

## B. HẠ TẦNG TÁI DÙNG ĐƯỢC cho 4 hướng

### B.1. AI / Claude
- **Đã có:** RAG offline BM25 (`app/agents/retrieval.py`, KB Eurowindow Light City ~59 chunk), Sales Agent dùng Claude (`app/agents/sales_agent.py`) trả lời khách qua Chatwoot/web. Config tại `app/core/settings.py` (`ANTHROPIC_API_KEY`, `LLM_MODEL`, `USE_MOCK_LLM`). Dùng Claude tại: `sales_agent.py`, `webhook.py`, `learning.py`, `openclaw_bridge.py`.
- **Intent scoring = keyword** (`sales_agent._score_intent`): "giá"+8, "xem nhà"+18, "đặt cọc"+25, threshold 70 → handoff. **Chưa có LLM classification, chưa có LLM lead-scoring.**
- **Phụ thuộc ngoài:** `ANTHROPIC_API_KEY`.

### B.2. Omnichannel
- **Chatwoot:** đã tích hợp (`app/api/webhook.py` `POST /webhook/chatwoot` → bot trả lời + auto handoff hot-lead; admin xem ở `conversations/`). Config `chatwoot_base_url/api_token/account_id/bds_team_id`.
- **Facebook:** chỉ **capture Lead Ads** (workflow `23-facebook-ads-lead`) → tạo lead. Chưa sync message Messenger.
- **Email:** SMTP config sẵn (`SMTP_HOST/USER/PASSWORD`); workflow `24-email-inbound-router` (phân loại theo keyword), `32-email-marketing-campaign` (SendGrid). Chưa có 2-way reply.
- **Zalo:** chỉ **publish** (workflow `26-auto-publish-zalo-oa`), chưa nhận inbound.
- **Thiếu chính:** **Unified inbox UI** gộp tất cả kênh vào 1 màn hình.
- **Phụ thuộc ngoài:** `CHATWOOT_API_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `ZALO_OA_ACCESS_TOKEN`, SMTP creds.

### B.3. Automation
- **35 n8n workflow** (`apps/agent-engine/n8n-workflows/`): nhóm sales-ops (01,02,11–15,34), customer lifecycle (03–10: welcome, booking reminder, re-engagement 14d, drip, birthday…), admin insight (16–20), integration (21–24), marketing (25–33), sale-bot intent (35). Trộn cron + webhook.
- **Webhook hook nội bộ:** `app/api/automation.py` (`/webhooks/internal/booking-created`, `/deal-closed`, `/commissions/distribute`, `/automation/audit`) — trả 202, gọi n8n qua BackgroundTask, bảo vệ bằng `X-Internal-Token`.
- **Không có rule engine nội bộ** — mọi automation delegate cho n8n. ~80% endpoint n8n còn dựa mock stub vì chưa có Postgres.
- **Phụ thuộc ngoài:** `INTERNAL_WEBHOOK_TOKEN`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `TELEGRAM_BOT_TOKEN`.

### B.4. No-code / config
- **Pattern config đã có và tái dùng tốt:** Sales Policy (`app/schemas/sales_policy.py` + `core/sales_policy_store.py`, endpoint `GET/PUT/POST reset/history`, lưu `data/_runtime/sales_policy.json` + versioning + backup), Commission config (`app/api/admin_commission.py`). UI admin đã có `SalesPolicyTab.tsx`, `AuditLogTable.tsx`.
- **Mẫu chuẩn:** Pydantic schema → JSON store atomic + version + backup → CRUD endpoint → audit log. **Đây là khuôn để nhân ra các config khác** (lead-routing rule, scoring weight, drip template…).
- **Thiếu:** builder kéo-thả thực sự (mới có form config từng loại).

---

## C. MAP TÍNH NĂNG COGOVER (CRM) + CALLIO (TỔNG ĐÀI) VÀO CODEBASE

Định hướng: học theo **COGOVER** (CRM BĐS) và **CALLIO** (tổng đài đa kênh). Bảng dưới phân rõ **làm được ngay trong code** (đã có nền) vs **cần tích hợp ngoài**.

### C.1. COGOVER — CRM

| Tính năng COGOVER | Nền hiện có | Phân loại |
|-------------------|-------------|-----------|
| Lead đa kênh | Đã capture FB Lead Ads + Chatwoot + web register; source field sẵn | **Code được ngay** (gom kênh đã nối); kênh mới cần token |
| Tự phân loại/phân bổ lead theo điều kiện | Đã có `auto_distribute_hot_lead` + `eligibility_score`; cần rule cấu hình | **Code được ngay** (theo pattern Sales Policy config) |
| Pipeline giao dịch | Mới có `status` vòng đời lead, **chưa có Deal stage riêng** | **Code được ngay** (thêm model Deal + stage) |
| Gộp lịch sử giao dịch/báo giá/hợp đồng/công nợ | Có Booking + Commission + Sales Policy (báo giá); chưa có hợp đồng/công nợ | **Code được phần lớn**; công nợ/hợp đồng cần thêm model |
| AI phân tích hành vi + dự đoán nhu cầu + đề xuất hành động | Claude + RAG + contact log + booking sẵn | **Code được ngay** (dùng `ANTHROPIC_API_KEY`) |
| Dashboard real-time | Có KPI/leaderboard/stats; chưa real-time đẩy | **Code được** (nên kèm Postgres + websocket/polling) |
| No-code workflow builder (kéo-thả) | Pattern config + 35 n8n workflow | **Lớn** — xem GĐ4 (nhúng/bridge n8n) |

### C.2. CALLIO — Tổng đài

> ⚠️ **Quan trọng:** Phần lõi tổng đài (gọi điện, ghi âm, IVR, auto-dial, speech-to-text) **KHÔNG dựng thuần code được** — bắt buộc dùng **hạ tầng telephony bên ngoài**. Đề xuất nhà cung cấp: **Stringee** (ưu tiên — có tại VN, hỗ trợ click-to-call/SDK/ghi âm/IVR, đầu số VN) hoặc **Twilio** (quốc tế, mạnh nhưng đầu số/giá VN kém thuận). STT tiếng Việt có thể dùng API của provider hoặc dịch vụ riêng (Google STT / FPT.AI / Viettel).

| Tính năng CALLIO | Phân loại | Ghi chú |
|------------------|-----------|---------|
| Click-to-call / gọi Zalo | **Code được (qua API provider)** — UI hiện đã có nút `tel:`/Zalo, nâng thành gọi qua Stringee API | Cần tài khoản Stringee + đầu số |
| Log cuộc gọi gắn vào CRM | **Code được ngay** — mở rộng `ContactLog` (channel="call" đã có) + webhook nhận call event | Provider gửi webhook trạng thái cuộc gọi |
| Báo cáo cuộc gọi real-time | **Code được** — dashboard từ call log | Sau khi có luồng log |
| IVR kéo-thả | **Cần dịch vụ ngoài** — cấu hình trên dashboard provider | Stringee/Twilio cung cấp |
| Auto-dial | **Cần dịch vụ ngoài** + code điều phối danh sách gọi | Provider API |
| Ghi âm cuộc gọi | **Cần dịch vụ ngoài** — provider lưu file, code chỉ nhận URL/gắn vào lead | Lưu link vào ContactLog |
| AI speech-to-text | **Cần dịch vụ ngoài** (STT) → sau đó **code được** phần tóm tắt/insight bằng Claude | STT VN: FPT.AI/Viettel/Google |
| Inbox đa kênh FB/Zalo/Instagram 1 màn hình | Trùng GĐ2 Omnichannel | Token từng kênh |

**Tóm tắt telephony:** phần *gắn vào CRM* (click-to-call qua API, log cuộc gọi, gắn ghi âm/transcript vào lead, báo cáo) **làm được trong code**; phần *hạ tầng* (đầu số, định tuyến IVR, auto-dial, engine ghi âm, STT) **phải mua dịch vụ ngoài** (khuyến nghị Stringee).

---

## D. LỘ TRÌNH 4 GIAI ĐOẠN

### GĐ1 — AI CRM (ưu tiên chốt TRƯỚC, chỉ cần `ANTHROPIC_API_KEY`)
Tái dùng Claude API + dữ liệu lead sẵn có → làm được ngay, không phụ thuộc kênh ngoài.

| Tính năng | File/endpoint cần thêm | Độ phức tạp | Phụ thuộc ngoài |
|-----------|------------------------|-------------|-----------------|
| **AI lead scoring** (thay công thức cứng) — Claude chấm điểm từ contact log + booking + hội thoại, trả `score + lý do` | `app/services/lead_scoring.py`; thay/bổ sung `compute_ai_score`; field `score_reason` | Trung bình | `ANTHROPIC_API_KEY` |
| **Đề xuất thời điểm liên hệ tốt nhất** — phân tích outcome/last_contact gợi ý giờ + kênh | `app/services/contact_timing.py`; hiển thị ở `LeadDetailPanel` | Thấp–TB | `ANTHROPIC_API_KEY` (có thể khởi đầu heuristic) |
| **Insight khách + next-best-action bằng Claude** — tóm tắt lịch sử + dự đoán nhu cầu | endpoint `/sale/leads/{id}/insight`; nút "AI insight" trong panel | Thấp | `ANTHROPIC_API_KEY` |
| **Pipeline trạng thái tự động** — auto chuyển status theo rule (interested→warm, booked→hot), thêm Deal stage | `app/core/lead_store.py` hook; model Deal; config kiểu sales_policy | Trung bình | Không |
| **LLM intent classification** — thay keyword ở `_score_intent` bằng Claude phân loại hot/warm/cold + confidence | sửa `app/agents/sales_agent.py` | Thấp | `ANTHROPIC_API_KEY` |

### GĐ2 — Omnichannel inbox (Chatwoot + email + FB/Zalo)
Gộp tin nhắn nhiều kênh vào 1 màn hình. Nên kèm migrate Postgres để dữ liệu thật.

| Tính năng | File/endpoint cần thêm | Độ phức tạp | Phụ thuộc ngoài |
|-----------|------------------------|-------------|-----------------|
| **Unified inbox** gộp Chatwoot + Email + FB + Zalo | trang admin `conversations/inbox`; mở rộng `admin_conversations.py` gom message | Cao | Token các kênh |
| **FB Messenger 2-way** (hiện chỉ Lead Ads) | webhook nhận + reply | Trung bình | `FB_PAGE_ACCESS_TOKEN` |
| **Zalo OA inbound** (hiện chỉ publish) | webhook nhận tin Zalo | Trung bình | `ZALO_OA_ACCESS_TOKEN` |
| **Email 2-way reply** | SMTP/IMAP hoặc Chatwoot email channel | Trung bình | SMTP/IMAP creds |
| **Automation gửi email/drip + tự đổi trạng thái** | dùng workflow 06/08/32; mở rộng `automation.py` | Trung bình | SendGrid/SMTP, `INTERNAL_WEBHOOK_TOKEN` |
| **Migrate JSON → PostgreSQL** | chạy alembic, thay store JSON, bỏ mock `n8n_stubs.py` | Cao | DB (schema đã có) |

### GĐ3 — Tổng đài (tích hợp telephony provider)
Lõi tổng đài cần dịch vụ ngoài (**Stringee** ưu tiên, hoặc Twilio). Code lo phần gắn vào CRM.

| Tính năng | File/endpoint cần thêm | Độ phức tạp | Phụ thuộc ngoài |
|-----------|------------------------|-------------|-----------------|
| **Click-to-call qua API provider** | `app/services/telephony.py`; nút gọi gọi Stringee SDK/API | Trung bình | **Stringee/Twilio** (đầu số) |
| **Log cuộc gọi gắn vào lead** | webhook `/webhooks/telephony/call-event` → ghi `ContactLog` (channel=call) | Trung bình | Provider webhook |
| **Gắn ghi âm vào lead** | nhận URL ghi âm từ provider, lưu field trong ContactLog | Thấp | Provider (ghi âm) |
| **Speech-to-text + AI tóm tắt cuộc gọi** | STT provider → Claude tóm tắt/insight | Cao | **STT** (FPT.AI/Viettel/Google) + `ANTHROPIC_API_KEY` |
| **Báo cáo cuộc gọi real-time** | dashboard từ call log | Trung bình | Sau khi có luồng log |
| **IVR kéo-thả / auto-dial** | cấu hình trên dashboard provider + code điều phối | Cao | **Provider** (không code thuần được) |

### GĐ4 — No-code workflow builder (lớn)

| Tính năng | File/endpoint cần thêm | Độ phức tạp | Phụ thuộc ngoài |
|-----------|------------------------|-------------|-----------------|
| **Workflow builder kéo-thả** (nhúng/bridge n8n cho admin tự tạo flow) | UI builder + lưu định nghĩa flow; bridge 35 workflow n8n | Rất cao | n8n |
| **Segment builder + rule auto-assign cấu hình UI** | config store theo pattern Sales Policy + UI | Cao | Không |
| **Custom field & dynamic form lead** | schema động + UI form builder | Cao | Không |
| **Scoring-weight editor + template editor** | config store + UI | Trung bình | Không |
| **Analytics nâng cao** (funnel, cohort, conversion, LTV) | dashboard + query Postgres | Cao | DB |

---

## Kết luận — chốt làm gì TRƯỚC

Nền tảng đã solid: schema lead đầy đủ, CRM sale/admin đủ dùng, Claude + RAG + Chatwoot đã chạy, 35 n8n workflow + pattern config (Sales Policy) tái dùng được. Hai điểm yếu lớn nhất: **dữ liệu còn chạy JSON/mock (chưa Postgres)** và **AI score là công thức cứng, intent là keyword**.

So với COGOVER/CALLIO: phần **CRM thông minh của COGOVER gần như làm được trong code** (đã có Claude + lead data); phần **tổng đài của CALLIO bắt buộc mua dịch vụ ngoài** (Stringee/Twilio) — code chỉ lo click-to-call, log cuộc gọi, gắn ghi âm/transcript, báo cáo.

**Chốt làm ngay GĐ1 (chỉ cần `ANTHROPIC_API_KEY`):** AI lead scoring + đề xuất thời điểm liên hệ + insight khách + pipeline tự động + LLM intent. Giá trị cao nhất cho sale, làm hoàn toàn trên codebase hiện tại. GĐ2 Omnichannel (cần token kênh), GĐ3 Tổng đài (cần Stringee + STT), GĐ4 No-code builder (lớn nhất, để cuối).
