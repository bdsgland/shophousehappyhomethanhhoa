# Báo cáo khảo sát: Tính năng "Dự án" cho Admin (read-only survey)

> Mục tiêu: làm rõ hiện trạng trang Chi tiết dự án + backend + admin để lập kế hoạch xây mục "Dự án" trong admin (sửa toàn bộ nội dung các tab + AI hỗ trợ, đồng bộ ra trang chi tiết; gộp "Quỹ căn" và "Tài liệu RAG" vào Dự án).
>
> Phạm vi khảo sát: KHÔNG sửa code. Ngày: 2026-06-13.

---

## ⚠️ Phát hiện quan trọng trước tiên

1. **App admin thật KHÔNG nằm trong workspace này.** Code chỉ rõ admin là một app riêng (`apps/admin`) deploy tại `https://admin.eurowindowlightcity.net` (xem `apps/web/lib/auth.ts` dòng 60–94: `ADMIN_APP_URL`, comment "App Admin (apps/admin) có cổng login Google riêng"). Thư mục local chỉ có `apps/agent-engine` (backend) và `apps/web` (web/sale/portal). **Vì vậy không đọc được mã nguồn 2 trang admin "Quỹ căn" và "Tài liệu RAG" — nhưng đọc được toàn bộ backend mà chúng gọi tới.** Khi build, cần mở thêm repo/thư mục `apps/admin`.

2. **Chưa có "Project store".** Trang chi tiết dự án hiện **chủ yếu hardcode** nội dung trong 1 file frontend (`elc-data.ts`). Chỉ 2 tab lấy dữ liệu sống từ backend: **Quỹ căn / Mặt bằng** (inventory) và **Tài liệu** (learning). Slug `eurowindow-light-city` bị hardcode ở nhiều nơi.

3. **Tab "Chính sách bán hàng" trên trang chi tiết KHÔNG đọc từ `sales_policy_store`** — nó hardcode trong `elc-data.ts`. `sales_policy_store` có thật và admin sửa được, nhưng chỉ phục vụ máy tính giá/phiếu báo giá, chưa nối vào tab này.

---

## 1. Trang chi tiết dự án (apps/web)

**File trang (route):** `apps/web/app/dashboard/project/[slug]/page.tsx`
- Server component: kiểm tra token → chưa đăng nhập thì redirect `/login` → render `<ProjectDetailDashboard slug={params.slug} />`.

**Component chính:** `apps/web/components/dashboard/ProjectDetailDashboard.tsx`
- `DEFAULT_PROJECT_SLUG = "eurowindow-light-city"` (dòng 79).
- Thực tế có **11 tab** (không phải 9): ngoài 9 tab bạn liệt kê còn có **Tài liệu** và **Tin tức**.
- Nguồn nội dung tĩnh import từ `apps/web/components/dashboard/elc-data.ts` — file ghi rõ ở đầu: *"Dữ liệu tĩnh cho trang Chi tiết dự án… Sau này admin CMS có thể chỉnh tại đây hoặc qua backend."* → tức **hiện chưa có CMS**.

### Bảng Tab → Nguồn dữ liệu

| # | Tab | Component | Nguồn dữ liệu | Loại |
|---|-----|-----------|----------------|------|
| 1 | Tổng quan | `OverviewTab` | `HERO_IMAGES`, `OVERVIEW_ROWS` (elc-data.ts) | **HARDCODE** |
| 2 | Vị trí | `LocationTab` | `CONNECTIONS`, `MAP_LAT/MAP_LNG` (elc-data) + iframe Google Maps | **HARDCODE** |
| 3 | Đào tạo | `TrainingTab` | `TRAININGS` (elc-data) — tất cả đang "Đang cập nhật" | **HARDCODE** |
| 4 | Phân khu | `SubzonesTab` | `SUBZONES` (elc-data) | **HARDCODE** |
| 5 | Mặt bằng quỹ căn | `UnitsTab withMap` | `fetchInventory()` → `GET /inventory/{slug}/units` + `MasterPlanMap`; fallback `UNITS` (elc-data) | **API LIVE** (inventory_store) |
| 6 | Quỹ căn | `UnitsTab focusAvailable` | `fetchInventory()` + `fetchInventoryStats()` → `GET /inventory/{slug}/stats`; fallback `UNITS` | **API LIVE** (inventory_store) |
| 7 | Ảnh 360° | `Tours360Tab` | `TOURS_360` (elc-data) — đều "Đang cập nhật" | **HARDCODE** |
| 8 | Chính sách bán hàng | `PolicyTab` | `POLICIES`, `PRICE_TABLE` (elc-data) | **HARDCODE** (KHÔNG dùng sales_policy_store) |
| 9 | Tiến độ | `TimelineTab` | `TIMELINE` (elc-data) | **HARDCODE** |
| 10 | Tài liệu | `DocumentsTab` | `fetchProjectDocuments(slug)` → `GET /projects/{slug}/documents`; fallback `DOCUMENTS` (elc-data) | **API LIVE** (learning_store lọc theo project_slug) |
| 11 | Tin tức | `NewsTab` | `NEWS` (elc-data) | **HARDCODE** |

**Lưu ý về slug:** prop `slug` **chỉ được dùng cho tab Tài liệu**. Tab Quỹ căn/Mặt bằng dùng hằng số riêng `INVENTORY_SLUG = "eurowindow-light-city"` hardcode trong `apps/web/lib/api.ts` (dòng 427), không dùng prop. Backend inventory cũng hardcode slug. → Hệ thống hiện là **1 dự án duy nhất**.

**Hàm gọi API (apps/web/lib/api.ts):**
- `fetchInventory()` (dòng 430) → `GET {AGENT_ENGINE_URL}/inventory/eurowindow-light-city/units?phankhu=&status=&quy=`, `cache: no-store`. Map field VN → EN (`id→code`, `phan_khu→zone`, `dien_tich→area`, `trang_thai→status`, `gia→price`, `position`…).
- `fetchInventoryStats()` (dòng 483) → `GET /inventory/{slug}/stats` → `{total, available, sold, reserved}`.
- `fetchProjectDocuments(slug)` (dòng 579) → `GET /projects/{slug}/documents`. Lỗi → `[]` để UI fallback `DOCUMENTS` tĩnh.

---

## 2. Backend: có "project store" / schema dự án không?

**KHÔNG có project_store cho nội dung.** Chi tiết:

- `apps/agent-engine/app/api/projects.py` (prefix `/projects`): **chỉ** phục vụ tài liệu của dự án, **reuse `learning_store`**:
  - `GET /projects/{slug}/documents` → `learning_store.list_documents(project_slug=slug)`
  - `GET /projects/{slug}/documents/{doc_id}/download`
  - Không có endpoint lưu/sửa nội dung (overview, vị trí, tiến độ…).

- **Slug `eurowindow-light-city` được hardcode/seed rải rác**, không có 1 nguồn trung tâm:
  - `apps/web/lib/api.ts` → `INVENTORY_SLUG` (dòng 427)
  - `apps/web/components/dashboard/ProjectDetailDashboard.tsx` → `DEFAULT_PROJECT_SLUG` (dòng 79)
  - `apps/web/components/agent/AgentSidebar.tsx` → link "Thông tin dự án ELC" (dòng 45)
  - Backend: `app/api/inventory.py` → `SLUG`; `app/core/settings.py` → `elc_project_slug` (dòng 85)

- **Thiết kế dự kiến (chưa code)** ghi trong `docs/ARCHITECTURE.md` mục 4: có bảng `projects (id, name, slug, developer, location, price_range, target_segment, status, …)`, `project_documents`, `project_chunks (pgvector)`. → Đây là khung mục tiêu để xây project_store thật.

### Các store ĐÃ CÓ trong backend (tái dùng được)

| Store | File | Lưu ở đâu | Field chính | project_slug? |
|-------|------|-----------|-------------|---------------|
| Inventory (Quỹ căn) | `app/core/inventory_store.py` | JSON `data/_runtime/inventory.json` (atomic write + auto-backup, thread-safe) | `id, lo, phan_khu, loai, dien_tich, mat_tien, trang_thai, gia/gia_tri/gia_min/gia_max, quy, huong, view, position{x,y}, source, deleted, updated_at` | ❌ (đơn dự án) |
| Learning (Tài liệu RAG) | `app/core/learning_store.py` | `data/learning/` (`index.json` + `files/` + `bm25.pkl` + `chunks.jsonl`) | `id, title, category, type, size, file_path, source(upload/google_drive), source_metadata, group, project_slug, chunks, indexed, created_at` | ✅ có |
| Sales policy (Chính sách) | `app/core/sales_policy_store.py` | JSON `data/_runtime/sales_policy.json` (backup + version) | `base_plans[BasePlan], addons[PolicyAddon], deposit_amount, note, version, last_updated_by/at` | ❌ (đơn cấu hình) |

---

## 3. Admin hiện tại: trang Quỹ căn & Tài liệu RAG + endpoint

**⚠️ UI của 2 trang này ở `apps/admin` (ngoài workspace).** Dưới đây là backend mà chúng gọi (đọc được đầy đủ) + phần liên quan trong apps/web.

### Quỹ căn (Inventory)
- **Public đọc:** `app/api/inventory.py` (prefix `/inventory`): `GET /{slug}/units`, `GET /{slug}/stats`. Có fallback mock khi store rỗng.
- **Admin:** `app/api/admin_inventory.py` (prefix `/admin/inventory`, `require_admin`): `POST /sync` (đồng bộ Google Sheets), `GET /sync/history`, `GET /backups`, `POST /restore/{ts}`.
- **CRUD từng căn:** các helper `admin_update_unit / admin_create_unit / admin_delete_unit` nằm trong `app/api/inventory.py` (sửa thẳng inventory_store).
- **Đồng bộ Sheets:** `app/core/inventory_sync.py` + `app/schemas/inventory_sync.py` — tải CSV public từ Google Sheets (`gviz/tq?tqx=out:csv`), parse 16 cột, map sang unit, `replace_all` + soft-delete căn cũ, ghi backup.
- **Seed:** `app/core/seed_exclusive.py` — 5 căn độc quyền có giá chi tiết, upsert lúc khởi động.
- **Trang sale liên quan trong apps/web:** `apps/web/app/agent/inventory/page.tsx` ("Bảng hàng") — chỉ đọc `fetchInventory()`.

### Tài liệu RAG (Learning)
- **API:** `app/api/learning.py` (prefix `/learning`):
  - `POST /documents` (upload — `require_admin`), `GET /documents?category=&group=&project_slug=` (sale/admin), `DELETE /documents/{id}`, `GET /documents/{id}/download`.
  - RAG: `POST /search` (BM25), `POST /ask` + `/ask/sync` (RAG + Claude stream), `POST /quote`, `GET /sales-policy` (PUBLIC).
- **Store:** `app/core/learning_store.py` (đã nêu ở mục 2) — gắn `project_slug` khi upload; index BM25 + chunks.
- **Đồng bộ Drive:** `app/core/drive_sync.py` + `app/api/admin_drive_sync.py` (lưu metadata Drive vào learning_store, kèm group + project_slug).
- **Trang sale liên quan trong apps/web:** `apps/web/app/agent/learning/page.tsx` + `components/agent/LearningCenter.tsx` (đọc/hỏi đáp), `app/dashboard/learning/upload/page.tsx`.

### Sales policy (Chính sách)
- `app/api/sales_policy.py` (prefix `/admin/sales-policy`, `require_admin`): `GET`, `PUT` (tăng version), `POST /reset`, `GET /history`. Store: `sales_policy_store.py`.

---

## 4. Cơ chế đồng bộ admin → web hiện tại

| Loại nội dung | Có sync? | Luồng |
|---------------|----------|-------|
| **Quỹ căn / Mặt bằng** | ✅ Đang chạy | Admin sync Google Sheets → `inventory_store` → web `fetchInventory()` (no-store) thấy ngay. **Đây là cơ chế sync DUY NHẤT đang hoạt động đầu-cuối.** |
| **Tài liệu** | ✅ Đang chạy | Admin upload / sync Drive (gắn `project_slug`) → `learning_store` → web `GET /projects/{slug}/documents`. |
| **Chính sách (tab Chi tiết)** | ❌ Không | Tab `PolicyTab` hardcode `POLICIES`/`PRICE_TABLE` trong elc-data. `sales_policy_store` (admin PUT được) chỉ chạy cho máy tính giá/`GET /learning/sales-policy`, **chưa nối vào tab này**. |
| **Tổng quan, Vị trí, Đào tạo, Phân khu, Ảnh 360°, Tiến độ, Tin tức** | ❌ Không | Hardcode trong `elc-data.ts`. Muốn đổi = sửa code + redeploy. **Admin hiện KHÔNG sửa được.** |

**Đã có endpoint ghi/sửa nội dung dự án chưa?** → **Chưa.** Có ghi cho inventory (qua sync/helper) và sales_policy (PUT), nhưng **không có** endpoint ghi nội dung biên tập của dự án (overview/vị trí/tiến độ/360/tin tức…). Cần tạo mới.

---

## 5. Đề xuất kiến trúc (chưa code)

### 5.1 Phân loại tab theo nguồn dữ liệu

**A. Dữ liệu có cấu trúc — TÁI DÙNG store sẵn có (gộp vào "Dự án"):**
- **Quỹ căn / Mặt bằng** → `inventory_store` (+ `admin_inventory`, `inventory_sync`). Giữ nguyên, đưa UI vào sub-tab "Quỹ căn" trong Dự án.
- **Tài liệu** → `learning_store` lọc theo `project_slug`. Đưa vào sub-tab "Tài liệu RAG".
- **Chính sách (máy tính giá)** → `sales_policy_store`. Đưa vào sub-tab "Chính sách".

**B. Nội dung biên tập tự do — CẦN tạo `project_store` mới (CMS):**
- Tổng quan (hero images + bảng thông số), Vị trí (mô tả + kết nối + toạ độ), Đào tạo, Phân khu, Ảnh 360°, Tiến độ, Tin tức, và phần *mô tả* của Chính sách. Lưu dạng **blocks/rich-text** theo từng section.

### 5.2 Backend cần tạo/sửa

Tạo mới:
- `app/core/project_store.py` — theo đúng pattern `inventory_store`/`sales_policy_store`: JSON `data/_runtime/projects/{slug}.json`, atomic write, auto-backup, `version`, thread-safe. Mỗi dự án 1 object chứa các section (overview, location, training, subzones, tours360, timeline, news, policy_text…).
- `app/schemas/project.py` — `ProjectContent` (các section là list block hoặc HTML/markdown), `ProjectOut`, `ProjectUpdateIn`. Kèm metadata theo ARCHITECTURE mục 4 (`name, slug, developer, location, status…`).
- `app/api/admin_projects.py` (prefix `/admin/projects`, `require_admin`): `GET /{slug}` (toàn bộ nội dung để admin sửa), `PUT /{slug}` hoặc `PATCH /{slug}/sections/{section}` (lưu từng tab), `GET /{slug}/history`.

Sửa:
- `app/api/projects.py` — thêm `GET /projects/{slug}` (public/đăng nhập) trả nội dung từ `project_store` cho web đọc.
- `app/main.py` — include router `admin_projects`.
- (Tùy chọn) `app/api/inventory.py` — bỏ hardcode `SLUG`, đọc theo `slug` param để sẵn sàng đa dự án về sau.

### 5.3 Frontend cần sửa

- **apps/admin (ngoài workspace):** thêm mục "Dự án" với các **sub-tab**: *Nội dung* (project_store, có nút "Sửa bằng AI" mỗi section) | *Quỹ căn* (admin_inventory) | *Tài liệu RAG* (learning) | *Chính sách* (sales_policy). 2 sub-tab Quỹ căn + Tài liệu RAG = di chuyển 2 mục admin hiện có vào đây, tái dùng endpoint cũ.
- **apps/web `ProjectDetailDashboard.tsx`:** thay các import hardcode từ `elc-data.ts` bằng `fetchProject(slug)` (`GET /projects/{slug}`). Giữ `elc-data.ts` làm **fallback/seed** khi API lỗi (giống cơ chế UNITS hiện tại).
- **apps/web `lib/api.ts`:** thêm `fetchProject(slug)`; bỏ hardcode `INVENTORY_SLUG`, truyền `slug` thật vào `fetchInventory`.
- **Nối tab Chính sách** với `sales_policy_store` (hoặc gộp phần text vào project_store, phần số liệu giữ ở sales_policy_store).

### 5.4 Chỗ gắn "Sửa bằng AI"

Áp cho các section **nội dung tự do** (nhóm B): mỗi ô soạn thảo có nút AI gọi 1 endpoint mới (tái dùng pipeline Claude như `/learning/ask`) — ví dụ `POST /admin/projects/{slug}/ai-edit` nhận `{section, current_content, instruction}` → trả nội dung block đã chỉnh để admin xem trước rồi lưu. Có thể nạp thêm ngữ cảnh từ `learning_store` (RAG) để AI viết bám tài liệu dự án.

### 5.5 Tóm tắt file phải đụng tới

- **Tạo (backend):** `app/core/project_store.py`, `app/schemas/project.py`, `app/api/admin_projects.py`.
- **Sửa (backend):** `app/api/projects.py`, `app/main.py`, (tùy chọn) `app/api/inventory.py`, `app/api/learning.py` (đảm bảo filter project_slug).
- **Tạo/sửa (admin — ngoài workspace):** trang "Dự án" + 4 sub-tab.
- **Sửa (web):** `components/dashboard/ProjectDetailDashboard.tsx`, `lib/api.ts`, giữ `components/dashboard/elc-data.ts` làm fallback.

---

## Phụ lục — file đã đọc
- `apps/web/app/dashboard/project/[slug]/page.tsx`
- `apps/web/components/dashboard/ProjectDetailDashboard.tsx`
- `apps/web/components/dashboard/elc-data.ts`
- `apps/web/lib/api.ts`, `apps/web/lib/auth.ts`
- `apps/web/components/agent/AgentSidebar.tsx`, `app/agent/inventory/page.tsx`, `app/admin/page.tsx`, `components/agent/LearningCenter.tsx`
- Backend: `app/api/projects.py`, `inventory.py`, `admin_inventory.py`, `learning.py`, `sales_policy.py`; `app/core/inventory_store.py`, `inventory_sync.py`, `learning_store.py`, `sales_policy_store.py`, `seed_exclusive.py`, `drive_sync.py`; `app/schemas/*`; `app/main.py`, `app/core/settings.py`
- `docs/ARCHITECTURE.md`
