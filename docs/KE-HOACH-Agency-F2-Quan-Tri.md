# KẾ HOẠCH — Khu Quản Trị Sàn F2 (Agency) đa-tenant

> Tài liệu **KHẢO SÁT + LẬP KẾ HOẠCH** (read-only, KHÔNG sửa code).
> Mục tiêu: chủ sàn F2 (role `agency`) có khu quản trị **kiểu admin** nhưng **chỉ thấy đội + khách của chính sàn mình** (multi-tenant).
> Ngày: 2026-06-13 · Phạm vi đọc: `apps/web`, `apps/agent-engine`, `apps/admin`.

---

## 0. Tóm tắt điều hành (đọc cái này trước)

- **Nguyên nhân agency vào nhầm dashboard sale:** điều hướng FE (`redirectByRole`) ĐÚNG (`agency → /agency-onboarding`), nhưng nó đọc `role` từ **đối tượng user trong cookie**, mà backend lại **bóp méo `role` về `"sale"`** trước khi trả về. Cụ thể `user_store.public_view()` có `_VALID_ROLES = {"admin","sale","client"}` và bất kỳ role lạ nào (kể cả `"agency"`) bị ép thành `"sale"`. Schema `UserOut`/`UserRole` cũng **không** liệt kê `"agency"`. Vì vậy sau đăng nhập/đăng ký, FE thấy `role="sale"` → `redirectByRole("sale") → /agent/crm` (khu sale). JWT thì vẫn mang đúng `role="agency"` nên middleware không chặn — chính sự **lệch giữa role trong JWT và role trong user-object** là gốc lỗi.
- **Phụ trợ:** middleware **không chặn** role `agency` khỏi khu sale (`/agent/*`); STAFF area chỉ chặn `client`. Nên kể cả sau khi sửa role, vẫn nên chặn agency khỏi `/agent/*`.
- **Kiến trúc đề xuất (tối thiểu-đủ-dùng):** thêm `agency_id` (= `id` bản ghi agency) lên **user role sale** và lên **lead**; mở nhóm endpoint mới `/agency/*` gác bằng `require_agency` + **lọc cứng theo `agency_id` của token**; khu FE mới `/agency-admin/*` tái dùng UI kit + các component bảng/CRM/báo cáo.
- **Độ lớn:** vừa (M). Rủi ro chính là đụng `lead_store`/`user_store` đang chạy thật (đã import 108–147 KH). Giảm rủi ro bằng **field tuỳ chọn, backfill, fail-open tương thích ngược**.

---

## 1. Role & điều hướng — vì sao agency vào `/dashboard/agent` (khu sale)

### 1.1 Luồng điều hướng FE (đang ĐÚNG về mặt logic)

`apps/web/lib/auth.ts`:

```ts
export function redirectByRole(role) {
  if (role === "agency") return "/agency-onboarding";   // F2 tự đăng ký
  if (isAgencyRole(role)) return "/agency";             // admin | manager (toàn nền tảng)
  return getDashboardUrl(role);                         // sale → /agent/crm, client → /client, ...
}
```

- `getDashboardUrl("sale") → "/agent/crm"`. (Lưu ý: đường dẫn khu sale thực tế là `/agent/crm`, không phải `/dashboard/agent`; "dashboard sale" mà chủ sàn thấy chính là `/agent/crm`.)
- Login (`app/login/page.tsx`) và Register (`app/register/page.tsx`) và OAuth callback (`app/auth/callback/page.tsx`) đều gọi `redirectByRole(data.user.role)` → phụ thuộc hoàn toàn vào `data.user.role`.

### 1.2 GỐC LỖI — backend bóp méo `role` về `sale`

`apps/agent-engine/app/core/user_store.py`:

```py
_VALID_ROLES = {"admin", "sale", "client"}      # ❌ thiếu "agency"

def public_view(user):
    role = user.get("role", "sale")
    if role not in _VALID_ROLES:
        role = "sale"                            # ❌ "agency" bị ép thành "sale"
    return { ..., "role": role, ... }
```

`apps/agent-engine/app/api/auth.py`:

```py
# login  (dòng ~34, ~39)
extra_claims={"role": user.get("role","sale")}   # ✅ JWT giữ ĐÚNG "agency"
user=UserOut(**user_store.public_view(user))     # ❌ user-object trả về role="sale"
```

`apps/agent-engine/app/schemas/admin.py`:

```py
UserRole = Literal["admin", "sale", "client"]    # ❌ không có "agency"
```

→ **Kết luận:** Đăng ký F2 (`POST /agency/register`) tạo user `role="agency"` đúng, và trả JWT đúng role `agency`. NHƯNG `"user"` trả kèm chạy qua `public_view()` → `role="sale"`. FE lưu cookie user với `role="sale"` → `redirectByRole("sale") → /agent/crm`. Đăng nhập lại cũng vậy (login endpoint dùng `public_view`).

### 1.3 Vì sao middleware không "cứu" được

`apps/web/middleware.ts` đọc role từ **JWT** (`decodeJwtPayload`), nên với JWT `role="agency"`:

- `/agency/*` (khu điều hành admin/manager) → bị `redirectToPortal` vì `isAgencyRole("agency")` = false (kit chỉ coi `admin|manager` là agency-role) → đẩy về `/agency-onboarding`. ✅ đúng kỳ vọng.
- `/agent/*` → **KHÔNG bị chặn**: STAFF area chỉ đẩy `client` ra ngoài; `agency` được vào tự do. Đây là lý do chủ sàn "kẹt" được ở khu sale mà không bị bật ra.

### 1.4 Ba khả năng đã nêu — phán quyết

| Giả thuyết | Kết luận |
|---|---|
| Role bị gán sai = sale | **ĐÚNG (ở tầng user-object)** — `public_view` ép `agency→sale`; JWT vẫn `agency`. Đây là nguyên nhân chính. |
| Redirect sai | Sai logic thì KHÔNG; redirect đúng. Nó chỉ nhận role đã bị bóp méo. |
| Tài khoản tạo trước khi có role agency | **Có thể xảy ra song song**: nếu chủ sàn đăng nhập bằng **tài khoản sale cũ** (role thật = `sale`), thì đương nhiên về `/agent/crm`. Cần kiểm tra dữ liệu `users.json` của tài khoản đang đăng nhập (xem mục 5.4). |

### 1.5 Cách sửa lỗi điều hướng (nhỏ, làm trước — Sprint 0)

1. Thêm `"agency"` vào `_VALID_ROLES` trong `user_store.public_view`.
2. Thêm `"agency"` vào `UserRole` (schemas `user.py` và `admin.py` nơi `UserOut` lấy type).
3. (FE) Chặn role `agency` khỏi `/agent/*` và `/dashboard/*` trong `middleware.ts` (đẩy về khu agency mới).
4. (Tùy chọn) Với tài khoản chủ sàn lỡ tạo dưới role `sale`: admin đổi role → `agency` (cần endpoint/skill set role, xem mục 5.4).

---

## 2. Mô hình dữ liệu hiện tại

### 2.1 `user_store` (file JSON `users.json`)

Trường mỗi user (`create_user`): `id, email, full_name, phone, role, is_active, dob, region, upline_email, referral_code, projects_interested, favorites, telegram_chat_id, source, facebook_url, google_id, picture, password_hash, created_at`.

- **Quan hệ phân cấp hiện có:** `upline_email` + `referral_code` (mô hình giới thiệu/MLM cho sale), **KHÔNG có `agency_id`/`parent` để gắn sale vào một sàn**.
- `public_view` whitel* role (mục 1.2). Role hợp lệ: `admin|sale|client` (+ cần thêm `agency`).

### 2.2 `lead_store` (file JSON `leads.json`)

Trường lead (`_new_lead`): `id, name, phone, email, source, status, assigned_sale_id, imported_by_sale_id, ai_score, booking_count, contact_count, effective_contact_count, registered, last_contact_at, hot_marker_at, created_at, updated_at, note` + nhóm hồ sơ mở rộng tuỳ chọn `region, customer_group, product_type, budget, purpose, project`.

- **Gắn sở hữu khách:** qua `assigned_sale_id` (và `imported_by_sale_id`). `list_leads_for_sale(sale_id)` lọc `assigned_sale_id == sale_id`.
- **KHÔNG có `agency_id`** trên lead.
- `public_view` của lead serialize danh sách trường cố định (gồm `assigned_sale_id`) — thêm `agency_id` cần thêm vào cả serialize.

### 2.3 `agency_application_store` (file `agency_applications.json`)

Bản ghi agency: `id, owner_user_id, ten_san, nguoi_dai_dien, phone, email, status(pending|active|rejected), commission_tier(base|f2_80), commission_pct, business_info{ten_dn,ma_so_thue,dia_chi,nguoi_dai_dien_phap_luat}, brokerage_declared, gpkd_so, sales[], can_config_sale_commission, submitted_for_review, review_note, reviewed_by, reviewed_at, created_at, updated_at`.

- **`sales[]` chỉ là DANH BẠ KHAI BÁO** dạng `{name, phone, email}` (hàm `_clean_sales`) — **KHÔNG phải tài khoản đăng nhập thật**, không liên kết tới `user_store`.
- `id` của bản ghi này là **định danh sàn** tự nhiên → dùng làm `agency_id`. `owner_user_id` = tài khoản chủ sàn.
- Khi admin duyệt `active` + đủ điều kiện → `commission_tier=f2_80`, `commission_pct=80`, `can_config_sale_commission=True`.

### 2.4 `commission_config_store` (file `commission_config.json`)

- **Một object cấu hình DUY NHẤT, toàn nền tảng** (versioned + backup + validate): `total_pool_percentage`, 5 `tiers` (tổng = 100%), `frontline_kpi_tiers` (bậc KPI liên tục). KHÔNG theo từng sàn.
- → Muốn "cấu hình hoa hồng cho sale của sàn" cần **store mới theo `agency_id`** (xem 3.4), không thể nhét vào config global này.

### 2.5 Sơ đồ quan hệ hiện tại vs đề xuất

```
HIỆN TẠI:
  agency(record).owner_user_id ──> user(role=agency)        [chỉ chủ sàn có liên kết]
  agency(record).sales[]  = [{name,phone,email}]            [danh bạ, KHÔNG là user]
  user(role=sale) ── upline_email/referral_code ──> user    [MLM, không phải sàn]
  lead.assigned_sale_id ──> user(role=sale)                 [sở hữu khách]
  (KHÔNG có đường nối sale ──> sàn, lead ──> sàn)

ĐỀ XUẤT (thêm cạnh in đậm):
  user(role=sale).**agency_id** ──> agency.id
  lead.**agency_id** ──> agency.id   (suy ra từ assigned_sale_id, hoặc gán khi tạo)
```

---

## 3. Kiến trúc multi-tenant tối thiểu-đủ-dùng

Nguyên tắc: **`agency_id` = `agency_application_store.id`**. Mọi truy vấn của khu F2 lọc cứng theo `agency_id` lấy từ **token của chủ sàn** (không nhận `agency_id` từ client).

### 3.1 Gắn SALE vào sàn

Chọn **kết hợp** hai cơ chế (đơn giản, tương thích ngược):

1. **Thêm `agency_id` (tuỳ chọn) vào user role `sale`.** Mặc định `None` (sale trực thuộc nền tảng/F1). Sale của F2 có `agency_id = <id sàn>`.
2. **"Kích hoạt" sale từ danh bạ khai báo:** thêm luồng để chủ sàn (hoặc admin lúc duyệt) **tạo tài khoản sale thật** từ `agency.sales[]`:
   - Với mỗi dòng sale hợp lệ → `user_store.create_user(role="sale", agency_id=<id sàn>, source="agency_provisioned", ...)` (mật khẩu tạm + buộc đổi, hoặc mời qua email).
   - Lưu ngược `user_id` vào dòng `agency.sales[]` (`{name,phone,email,user_id,activated_at}`) để biết dòng nào đã có tài khoản.
   - Cho phép chủ sàn thêm sale sau khi đã active (không chỉ lúc onboarding).

> Tối thiểu để CHẠY ĐƯỢC ngay: chỉ cần (1) `agency_id` trên user + một cách set nó. (2) là phần "đủ dùng" để chủ sàn tự vận hành đội.

### 3.2 Suy ra "KHÁCH của sàn"

Hai tầng, dùng cả hai để vừa đúng vừa rẻ:

1. **Suy diễn (đọc):** khách của sàn = các lead có `assigned_sale_id ∈ {user.id | user.agency_id == <id sàn>}`. Không cần sửa dữ liệu cũ → **tương thích ngược tuyệt đối**.
2. **Đóng dấu (ghi):** thêm `agency_id` (tuỳ chọn) lên lead, **tự điền khi tạo/gán**: khi `create_lead`/`assign` cho một sale có `agency_id`, copy `agency_id` đó vào lead. Giúp truy vấn nhanh + giữ lịch sử kể cả khi sau này sale rời sàn.

> Khu F2 dùng (1) làm nguồn chân lý lúc đọc (an toàn nhất), (2) là tối ưu/đảm bảo nhất quán dần dần (backfill).

### 3.3 Endpoint scoped cho agency (gác `require_agency` + lọc theo token)

Tạo router mới (vd `app/api/agency_admin.py`, prefix `/agency`) — tất cả `Depends(require_agency)` và **chỉ trả dữ liệu của sàn suy ra từ `user`**:

| Method · Path | Mô tả | Nguồn dữ liệu / lọc |
|---|---|---|
| `GET /agency/team` | Đội sale của sàn + KPI | `user_store` lọc `agency_id`; KPI từ `sale_task_store`/hiệu suất |
| `POST /agency/team` | Tạo/mời tài khoản sale cho sàn | `create_user(role=sale, agency_id=...)` |
| `PATCH /agency/team/{id}` | Khoá/mở/sửa sale (chỉ sale thuộc sàn) | guard `user.agency_id == token.agency_id` |
| `GET /agency/leads` | CRM khách của sàn | `lead_store` lọc theo tập sale của sàn (3.2) |
| `GET /agency/leads/{id}` | Hồ sơ 360 khách (nếu thuộc sàn) | guard sở hữu trước khi trả |
| `PATCH /agency/leads/{id}` | Cập nhật/giao lại khách trong nội bộ sàn | chỉ giao cho sale thuộc sàn |
| `GET /agency/report` | Báo cáo doanh số sàn | tổng hợp lead/booking/deal của sàn |
| `GET /agency/commission` · `PUT` | Cấu hình hoa hồng cho sale của sàn | store mới `agency_commission_store` (3.4); chỉ khi `can_config_sale_commission` |
| `GET /agency/inventory` | Bảng hàng (đọc) | tái dùng inventory (read-only, có thể chung toàn nền tảng) |
| `GET /agency/training` | Đào tạo/tài liệu | tái dùng KB/learning (đọc) |

**Bảo mật bắt buộc:**

- `agency_id` **luôn lấy từ `user` (token)** qua `agency_application_store.get_by_owner(user.id).id` — **không bao giờ** nhận từ query/body của client.
- Mọi endpoint chi tiết (`/leads/{id}`, `/team/{id}`) phải **guard quyền sở hữu** (record thuộc sàn) trước khi trả/sửa → tránh IDOR.
- KHÔNG cho agency gọi các endpoint `require_admin` (manager/toàn nền tảng). Khu `/agency` PWA hiện tại (overview/team/decisions/ai) đang gọi `fetchManagerOverview` (admin) → **không tái dùng nguyên trạng cho F2**; phải trỏ sang các endpoint scoped mới.

### 3.4 `agency_commission_store` (mới) — hoa hồng theo sàn

- File `agency_commission.json` keyed theo `agency_id` → mỗi sàn 1 cấu hình con (vd % chia cho sale frontline của sàn, trong khuôn khổ 80% sàn được hưởng).
- Tái dùng **pattern** của `commission_config_store` (atomic write, version, validate) nhưng tách theo tenant. Chỉ ghi được khi `can_config_sale_commission == True`.

### 3.5 Component admin tái dùng được

| Mục đích | Tái dùng từ | Ghi chú |
|---|---|---|
| Khung UI (header, card, KPI, auth hook) | `apps/web/components/agency/AgencyKit.tsx` (`AgencyHeader, Card, KpiCard, EmptyState, useAgencyAuth, fmtNum`) | Đã có sẵn cho khu agency PWA — dùng lại trực tiếp |
| Bảng/Hồ sơ CRM, Pipeline kanban, Customer-360 | `apps/admin/app/(dash)/customers`, `customer-360`, `pipeline`, `customers/[id]` | Trích thành component dùng chung **nhận `scope`/endpoint** thay vì hardcode admin API |
| Báo cáo/biểu đồ doanh số | `apps/admin/app/(dash)/page.tsx`, `customers/performance`, `finance` | Tách phần trình bày, đổ data từ `/agency/report` |
| Cấu hình hoa hồng (UI 5 bậc + validate) | `apps/admin` settings/commission UI | Bind vào `/agency/commission` thay vì config global |
| Bảng hàng / Inventory | `apps/web/app/agent/inventory` + `apps/admin/(dash)/inventory` | Đọc chung; có thể không cần tách theo sàn |
| Đào tạo / KB | `apps/admin/(dash)/kb`, `apps/web/app/agent/learning` | Đọc chung |

> Cách tái dùng an toàn nhất: **giữ component trình bày, tham số hoá lớp data-fetch** (truyền hàm fetch/endpoint + token). Tránh import trực tiếp app `admin` vào app `web` (khác Next app) — thay vào đó **đưa logic chung lên `apps/web/components`** hoặc copy có chủ đích.

---

## 4. Các MÀN HÌNH khu quản trị sàn F2 (sidebar) + nguồn dữ liệu

Khu mới đề xuất đặt tại **`/agency-admin/*`** (tách khỏi `/agency/*` vốn dành admin/manager toàn nền tảng, và khỏi `/agency-onboarding` chỉ là hồ sơ). Mỗi màn lọc theo `agency_id` của token.

| # | Màn hình (sidebar) | Đường dẫn | Nguồn dữ liệu (endpoint scoped) |
|---|---|---|---|
| 1 | Tổng quan sàn | `/agency-admin` | `GET /agency/report` (KPI: sale, khách, nóng, chốt, doanh số) |
| 2 | Đội sale của sàn | `/agency-admin/team` | `GET/POST/PATCH /agency/team` |
| 3 | CRM khách của sàn | `/agency-admin/leads` | `GET /agency/leads` (+ filter trạng thái/nguồn) |
| 4 | Hồ sơ 360 / Pipeline | `/agency-admin/leads/[id]`, `/agency-admin/pipeline` | `GET /agency/leads/{id}`, kanban theo sàn |
| 5 | Báo cáo doanh số | `/agency-admin/report` | `GET /agency/report` (theo sale/tháng/dự án) |
| 6 | Cấu hình hoa hồng sale | `/agency-admin/commission` | `GET/PUT /agency/commission` (gate `can_config_sale_commission`) |
| 7 | Bảng hàng | `/agency-admin/inventory` | `GET /agency/inventory` (đọc, có thể chung) |
| 8 | Đào tạo | `/agency-admin/training` | `GET /agency/training` (KB/learning, đọc) |
| 9 | Hồ sơ sàn & điều kiện F2 | `/agency-admin/profile` (hoặc link `/agency-onboarding`) | `GET/PUT /agency/me`, `submit-for-review` (đã có) |
| 10 | Tài khoản | `/agency-admin/account` | `/auth/me`, đăng xuất |

Gate trạng thái: sàn `pending` → cho xem nhưng nhắc hoàn tất hồ sơ; chỉ `active` mới mở đủ công cụ (đặc biệt #6). Tái dùng `StatusBadge`/`ProgressItem` từ `agency-onboarding`.

---

## 5. Đánh giá độ lớn, rủi ro & cách làm AN TOÀN

### 5.1 Độ lớn: **M (vừa)**

- Sprint 0 (sửa role/redirect): **S** — vài dòng + 1 guard middleware.
- Backend scoped endpoints + `agency_id` trên user/lead: **M**.
- FE khu `/agency-admin` (tái dùng kit): **M**.
- Hoa hồng theo sàn + provisioning sale: **M** (có thể đẩy sang giai đoạn 2).

### 5.2 Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Đụng `lead_store`/`user_store` đang chạy thật (đã có 108–147 KH) | Cao | `agency_id` là field **tuỳ chọn**, mặc định `None`; đọc luôn dùng `.get("agency_id")`; KHÔNG đổi shape record cũ |
| Rò rỉ dữ liệu chéo sàn (IDOR) | Cao | `agency_id` chỉ lấy từ token; guard sở hữu mọi endpoint chi tiết; viết test đa-tenant |
| Lead cũ không có `agency_id` "biến mất" khỏi khu F2 | Trung | Dùng **suy diễn theo tập sale** (3.2-1) làm nguồn đọc → lead cũ vẫn hiện đúng |
| Sale cũ không có `agency_id` | Trung | Suy diễn/agency tự gán; mặc định coi là sale nền tảng (không thuộc sàn nào) |
| `public_view` whitelist role làm vỡ thêm chỗ khác | Thấp | Chỉ thêm `"agency"`; giữ fallback `→ sale` cho role lạ khác |
| Khu `/agency` PWA cũ (admin/manager) bị nhầm là khu F2 | Trung | Đặt khu F2 ở `/agency-admin/*` riêng; không sửa `/agency/*` |

### 5.3 Nguyên tắc tương thích ngược (bắt buộc)

1. Mọi field mới (`agency_id` trên user & lead, `user_id` trong `sales[]`) **tuỳ chọn, mặc định vắng/None**; đọc bằng `.get()`.
2. **Không hard-delete, không đổi tên field cũ.** Tuân thủ convention atomic-write hiện có.
3. **Backfill có kiểm soát** (script riêng, idempotent): suy `lead.agency_id` từ `assigned_sale_id.agency_id`; chạy được lặp lại, log số bản ghi cập nhật.
4. Thêm `agency_id` vào `lead_store.public_view`/serialize chỉ khi có giá trị.
5. Viết **test đa-tenant**: 2 sàn, đảm bảo sàn A không bao giờ thấy sale/lead của sàn B; agency không gọi được endpoint admin.

### 5.4 Kiểm tra dữ liệu thực tế (cần làm khi vào sửa)

- Mở `data/_runtime/users.json`: xác minh tài khoản chủ sàn đang đăng nhập có `role == "agency"` hay `"sale"`. Nếu `"sale"` → đây là "tài khoản tạo trước khi có role agency" → cần đổi role.
- Mở `data/_runtime/agency_applications.json`: kiểm tra bản ghi sàn (status/tier) tương ứng `owner_user_id`.

---

## 6. Danh sách FILE cần TẠO / SỬA (khi triển khai — chưa làm)

### 6.1 Sprint 0 — Sửa lỗi điều hướng (ưu tiên cao, nhỏ)

| File | Thay đổi |
|---|---|
| `apps/agent-engine/app/core/user_store.py` | Thêm `"agency"` vào `_VALID_ROLES` |
| `apps/agent-engine/app/schemas/user.py` (và `admin.py`) | Thêm `"agency"` vào `UserRole` Literal của `UserOut` |
| `apps/web/middleware.ts` | Chặn role `agency` khỏi `/agent/*`, `/dashboard/*` → đẩy về `/agency-admin` |
| `apps/web/lib/auth.ts` | Trỏ `redirectByRole("agency")` → `/agency-admin` (sau khi đủ điều kiện) hoặc giữ `/agency-onboarding` khi pending |

### 6.2 Backend — multi-tenant (TẠO/SỬA)

| File | Loại | Thay đổi |
|---|---|---|
| `apps/agent-engine/app/api/agency_admin.py` | TẠO | Router `/agency/*` scoped: team/leads/report/commission… (`require_agency` + lọc `agency_id`) |
| `apps/agent-engine/app/core/user_store.py` | SỬA | `create_user(..., agency_id=None)`; lưu + serialize `agency_id`; helper `list_by_agency(agency_id)` |
| `apps/agent-engine/app/core/lead_store.py` | SỬA | Thêm `agency_id` (tuỳ chọn) vào `_new_lead`/serialize; helper `list_leads_for_agency(sale_ids)` |
| `apps/agent-engine/app/core/agency_application_store.py` | SỬA | `sales[]` lưu thêm `user_id`; helper map sàn↔sale |
| `apps/agent-engine/app/core/agency_commission_store.py` | TẠO | Cấu hình hoa hồng theo `agency_id` (pattern giống `commission_config_store`) |
| `apps/agent-engine/app/schemas/agency.py` | SỬA | Schemas cho team/leads/report/commission scoped |
| `apps/agent-engine/app/main.py` (nơi include router) | SỬA | `include_router(agency_admin.router)` |
| `apps/agent-engine/scripts/backfill_agency_id.py` | TẠO | Backfill idempotent `lead.agency_id` từ `assigned_sale_id` |
| `apps/agent-engine/tests/test_agency_tenant.py` | TẠO | Test cách ly đa-tenant + chặn endpoint admin |

### 6.3 Frontend — khu `/agency-admin` (TẠO)

| File | Thay đổi |
|---|---|
| `apps/web/app/agency-admin/layout.tsx` | Layout + sidebar/nav khu F2 (tái dùng AgencyKit) |
| `apps/web/app/agency-admin/page.tsx` | Tổng quan sàn |
| `apps/web/app/agency-admin/team/page.tsx` | Đội sale (CRUD scoped) |
| `apps/web/app/agency-admin/leads/page.tsx` + `[id]/page.tsx` | CRM khách + Hồ sơ 360 |
| `apps/web/app/agency-admin/pipeline/page.tsx` | Pipeline kanban theo sàn |
| `apps/web/app/agency-admin/report/page.tsx` | Báo cáo doanh số |
| `apps/web/app/agency-admin/commission/page.tsx` | Cấu hình hoa hồng sale |
| `apps/web/app/agency-admin/inventory/page.tsx`, `training/page.tsx`, `account/page.tsx` | Bảng hàng / Đào tạo / Tài khoản |
| `apps/web/lib/api.ts` | Thêm hàm `fetchAgencyTeam/Leads/Report/Commission…` (gọi `/agency/*` scoped) |
| `apps/web/components/agency/*` | Tách component bảng/CRM/report dùng chung (nhận endpoint/scope) |
| `apps/web/components/pwa/BottomNav.tsx` | (Tuỳ chọn) thêm nhánh tab cho `/agency-admin` |

---

## 7. Các BƯỚC BUILD chia nhỏ (đề xuất thứ tự)

1. **Sprint 0 — Hotfix điều hướng:** thêm `agency` vào `_VALID_ROLES` + `UserRole`; chặn `agency` khỏi `/agent` trong middleware; kiểm tra & (nếu cần) đổi role tài khoản chủ sàn trong `users.json`. → Chủ sàn vào đúng khu, không còn lạc vào CRM sale.
2. **Bước 1 — Nền tenant (đọc):** thêm `agency_id` tuỳ chọn vào `user_store` + helper `list_by_agency`; suy diễn "khách của sàn" theo tập sale; chưa cần sửa lead.
3. **Bước 2 — Router scoped (read-only):** `GET /agency/team`, `/agency/leads`, `/agency/report` (lọc theo token) + test đa-tenant.
4. **Bước 3 — Khu FE `/agency-admin` (read-only):** layout + Tổng quan + Đội sale + CRM (tái dùng AgencyKit). Trỏ `redirectByRole`/middleware vào khu mới.
5. **Bước 4 — Ghi/vận hành:** tạo tài khoản sale từ danh bạ (`POST /agency/team`), giao lại khách nội bộ sàn, đóng dấu `lead.agency_id` khi tạo/gán + script backfill.
6. **Bước 5 — Hoa hồng theo sàn:** `agency_commission_store` + endpoint + UI (gate `can_config_sale_commission`).
7. **Bước 6 — Bổ sung:** Pipeline kanban, Bảng hàng, Đào tạo (đọc), hoàn thiện báo cáo + biểu đồ.
8. **Bước 7 — Kiểm thử & nghiệm thu:** test cách ly 2 sàn, kiểm IDOR, xác nhận tài khoản/lead cũ (không `agency_id`) vẫn chạy.

---

## Phụ lục A — Trích dẫn mã nguồn then chốt

- Điều hướng: `apps/web/lib/auth.ts` (`redirectByRole`, `getDashboardUrl`, `isAgencyRole`)
- Middleware FE: `apps/web/middleware.ts` (đọc role từ JWT; STAFF area không chặn `agency`)
- Đăng ký F2: `apps/agent-engine/app/api/agency.py` (`register_agency` tạo `role="agency"`, trả `public_view`)
- Bóp méo role (GỐC LỖI): `apps/agent-engine/app/core/user_store.py` (`_VALID_ROLES`, `public_view`)
- Login/JWT: `apps/agent-engine/app/api/auth.py` (JWT đúng role, user-object qua `public_view`)
- Guard: `apps/agent-engine/app/api/deps.py` (`require_agency`, `require_admin`, `require_sale`)
- Lead: `apps/agent-engine/app/core/lead_store.py` (`_new_lead`, `create_lead`, `list_leads_for_sale`)
- Hồ sơ sàn: `apps/agent-engine/app/core/agency_application_store.py` (`sales[]` = danh bạ, `id`, `owner_user_id`)
- Hoa hồng global: `apps/agent-engine/app/core/commission_config_store.py` (1 config toàn nền tảng)
- UI kit + khu agency hiện có: `apps/web/components/agency/AgencyKit.tsx`, `apps/web/app/agency/*` (admin/manager scope), `apps/web/app/agency-onboarding/page.tsx`
- Bộ công cụ admin để tái dùng: `apps/admin/app/(dash)/*` (customers, customer-360, pipeline, sales, finance, inventory, kb, …)
