# Báo cáo kiểm tra toàn diện & khắc phục — Agent-Proptech
**Ngày:** 13/06/2026 · **Nhánh:** `main` (up-to-date với origin)

---

## (A) Kết quả biên dịch

| Thành phần | Lệnh | Kết quả |
|---|---|---|
| **Backend** (apps/agent-engine) | `python3 -m py_compile $(find app -name '*.py')` | ✅ **PASS** — không lỗi cú pháp/import |
| **Admin** (apps/admin) | `npx tsc --noEmit` | ✅ **PASS** — exit 0, không lỗi type |
| **Web** (apps/web) | `npx tsc --noEmit` | ✅ **PASS** — exit 0, không lỗi type |

**Cả ba thành phần biên dịch sạch. Không phát hiện lỗi build/type nào cần sửa.**

> ⚠️ **Giới hạn cần lưu ý:** VM sandbox **không cài** `fastapi`/`sqlalchemy` nên không chạy được
> import runtime của `app.main`. `py_compile` chỉ bắt lỗi **cú pháp/parse**, không bắt lỗi
> import-time (vd: tên hàm sai khi import). Đã **rà tĩnh kỹ** thay thế: kiểm mọi `_ROUTER_SPECS`
> attr tồn tại bằng AST, đối chiếu route FE↔BE. Khuyến nghị chạy `uvicorn app.main:app` 1 lần
> trên môi trường có deps để xác nhận log `[ROUTER]` 0 lỗi.

---

## (B) File đã sửa + Lệnh Git

**Không sửa file nào.** Toàn bộ thay đổi gần đây đã được commit và biên dịch sạch.
`git status` = **working tree clean**, không có thay đổi dở dang.

**Lệnh git:** không cần commit/push gì cho phần code (không có thay đổi).

Chỉ có một việc dọn dẹp — tồn tại file khóa rỗng `.git/index.lock` (0 byte, sót lại trong
phiên). Nên xóa để không chặn commit lần sau:

```bash
cd /Users/phamvanthu/Documents/Agent-Proptech
rm -f .git/index.lock
git status   # xác nhận "working tree clean"
```

---

## (C) Tồn đọng

### Nhóm 1 — CẦN SỬA CODE
**Không còn.** Kết quả kiểm tra wiring:

- **`_ROUTER_SPECS` (main.py):** đã đăng ký đầy đủ tất cả router mới — `api_keys`,
  `marketing_pipeline`, `ai_sales`, `crew`, `admin_projects`, `customer_360`, `integrations`,
  `admin_marketing`, `admin_conversations`… Mọi attr trong spec đều tồn tại (kiểm bằng AST).
- **2 module không đăng ký — đúng chủ đích, không phải lỗi:**
  - `sale_bot_endpoints.py`: docstring nêu rõ chỉ dùng cho n8n workflow và **cảnh báo trùng route**
    (`/inventory/quote`, `/crm/leads/search`, `/bookings`) nếu đăng ký → cố ý để ngoài.
  - `openclaw_mcp.py`: mount dạng ASGI app (`mcp_asgi_app`), không phải REST router.
- **Đối chiếu endpoint FE↔BE (các tính năng mới) — khớp 100%:**
  - Crew `/admin/crew/{status,agents,leads/{id}/run}` ✓
  - Đội Sale AI `/admin/ai-sales/*` (seed, list, stats, run-cycle, care-queue…) ✓
  - Customer 360 `/crm/leads/{id}/{profile-360,conversations,care}` ✓
  - Project CMS `/admin/projects/{slug}/{sections,ai-edit,history}` ✓
  - Marketing Pipeline `/admin/marketing/pipeline/*` ✓
  - API Keys `/admin/api-keys/*`, Integrations `/admin/integrations/*` ✓
- **nav-items.ts:** 14 icon import đều được dùng (không icon thừa); cả 14 route nav đều có
  `page.tsx` tương ứng (không orphan/404). Route đã ẩn (`/inventory`, `/kb`, `/pipeline`,
  `/conversations`, `/inbox`, `/platforms`, `/import`) vẫn còn page, chỉ bỏ khỏi menu — không vỡ build.
- **Lớp lỗi từng gặp:** serialize list lead/user đã bọc **per-record** an toàn
  (`crm.py:_serialize_lead` try/except từng record + từng log; `customer_360.py` bọc Chatwoot
  không làm sập 360; `leads.py` mirror an toàn). Bản ghi lệch enum status/source/channel được xử
  lý trả raw thay vì 500.

### Nhóm 2 — CẦN CẤU HÌNH (env / dịch vụ ngoài — KHÔNG sửa code)
Các mục sau là cấu hình vận hành, cần điền key/secret trên môi trường (Railway), **không phải lỗi code**:

- **Dify (bộ não RAG):** `DIFY_API_KEY`, `DIFY_API_URL`, `DIFY_DATASET_API_KEY`,
  `DIFY_DATASET_ID`, `PLATFORM_DIFY_URL` — hoặc cấu hình qua UI admin (Cấu hình → Dify).
- **Stringee (gọi điện):** `STRINGEE_FROM_NUMBER` + API key/sid. Các commit gần đây đã sửa
  CALL_NOT_ALLOWED / USER_ID_TOO_LONG ở phía code; còn lại là cấu hình số gọi đi.
- **Chatwoot (hộp thư đa kênh):** `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN`.
- **n8n (automation):** URL/credential workflow.
- **Google / Gmail (gửi email qua Gmail API, Drive sync, Sheets import):** OAuth client +
  refresh token (xem `CHECKLIST_GOOGLE_FIX.md` trong repo).

---

## Tóm tắt
Hệ thống ở trạng thái **biên dịch sạch cả 3 tầng**, wiring router & nav đầy đủ và nhất quán,
endpoint FE↔BE khớp, không có file dở dang. **Không cần sửa code.** Việc còn lại thuần
**cấu hình dịch vụ ngoài** (Dify/Stringee/Chatwoot/n8n/Google) + xóa `.git/index.lock`.
