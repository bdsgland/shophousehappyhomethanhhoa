# Hướng dẫn dựng mục "Dự án" trong app Admin (apps/admin — ngoài workspace)

> App `apps/admin` deploy tại `https://admin-happyhomethanhhoa.bdsg.land` KHÔNG nằm trong
> workspace này (chỉ có `apps/agent-engine` + `apps/web`). Tài liệu này cung cấp
> CODE SẴN để dán vào repo admin, khớp với backend đã hoàn thiện. Backend đã sẵn
> sàng — chỉ cần ráp UI.

## 1. Endpoint backend đã có (đã code xong, đã đăng ký router)

Tất cả `/admin/*` yêu cầu header admin: `Authorization: Bearer <JWT admin>` HOẶC
`X-API-Key: elc_sk_...` (scope `admin_full`). PUBLIC chỉ đọc.

| Method | Path | Quyền | Mục đích |
|--------|------|-------|----------|
| GET | `/admin/projects` | admin | Danh sách dự án (summary: slug, name, status, version, last_updated_at) |
| GET | `/admin/projects/{slug}` | admin | Toàn bộ `ProjectDoc` (meta + content 8 section) để sửa |
| PUT | `/admin/projects/{slug}` | admin | Cập nhật meta + (tuỳ chọn) toàn bộ content. Body `ProjectUpdateIn` |
| PATCH | `/admin/projects/{slug}/sections/{section}` | admin | Lưu **1 tab** (body = nội dung section) |
| POST | `/admin/projects/{slug}/ai-edit` | admin | AI đề xuất nội dung 1 tab (KHÔNG tự lưu) |
| GET | `/admin/projects/{slug}/history` | admin | Lịch sử phiên bản |
| GET | `/projects/{slug}` | PUBLIC | Web/sale/khách đọc nội dung (đồng bộ) |

`section` ∈ `overview | location | training | subzones | gallery360 | policy | timeline | news`.

Các tab DÙNG LẠI store sẵn có (KHÔNG nằm trong project_store):
- **Quỹ căn / Mặt bằng** → `/inventory/{slug}/units`, `/inventory/{slug}/stats`, admin `/admin/inventory/*`.
- **Tài liệu RAG** → `/learning/documents` (+ `/projects/{slug}/documents`).
- **Chính sách (số liệu giá)** → `/admin/sales-policy` (GET/PUT).

## 2. Hình dạng dữ liệu (TypeScript types để dùng trong admin)

```ts
export type HeroImage = { src: string; caption: string };
export type KeyValue = { label: string; value: string };
export type Connection = { place: string; time: string };
export type TrainingItem = { title: string; size: string; date: string; href: string; ready: boolean };
export type Subzone = { name: string; style: string; units: string; desc: string; img: string };
export type Tour360 = { title: string; img: string; ready: boolean };
export type PolicyCard = { title: string; date: string; open: boolean; summary: string; highlights: string[] };
export type PriceRow = { product: string; area: string; from: string };
export type TimelineItem = { period: string; title: string; desc: string; img: string };
export type NewsItem = { title: string; date: string; excerpt: string; img: string; url: string };

export type ProjectContent = {
  overview: { hero_images: HeroImage[]; rows: KeyValue[] };
  location: { description: string; connections: Connection[]; map_lat: number | null; map_lng: number | null };
  training: { items: TrainingItem[] };
  subzones: { items: Subzone[] };
  gallery360: { items: Tour360[] };
  policy: { policies: PolicyCard[]; price_table: PriceRow[]; commission_note: string };
  timeline: { items: TimelineItem[] };
  news: { items: NewsItem[] };
};

export type ProjectDoc = {
  slug: string; name: string; tagline: string; status: string;
  developer: string; location: string; content: ProjectContent;
  version: number; last_updated_at: string | null;
};

export type ProjectSummary = { slug: string; name: string; status: string; version: number; last_updated_at: string | null };

export type AIEditOut = {
  section: string; used_llm: boolean;
  suggestion: Record<string, unknown> | null;
  suggestion_text: string | null;
  note: string | null;
};
```

## 3. API client (điều chỉnh theo wrapper sẵn có của admin)

```ts
const API = process.env.NEXT_PUBLIC_AGENT_ENGINE_URL || "https://api-happyhomethanhhoa.bdsg.land";

function adminHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function listProjects(token: string): Promise<ProjectSummary[]> {
  const r = await fetch(`${API}/admin/projects`, { headers: adminHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(`Lỗi tải danh sách dự án (${r.status})`);
  return r.json();
}

export async function getProject(token: string, slug: string): Promise<ProjectDoc> {
  const r = await fetch(`${API}/admin/projects/${slug}`, { headers: adminHeaders(token), cache: "no-store" });
  if (!r.ok) throw new Error(`Lỗi tải dự án (${r.status})`);
  return r.json();
}

/** Lưu 1 tab nội dung (khuyên dùng — payload nhỏ, không clobber tab khác). */
export async function saveSection(token: string, slug: string, section: string, data: unknown): Promise<ProjectDoc> {
  const r = await fetch(`${API}/admin/projects/${slug}/sections/${section}`, {
    method: "PATCH", headers: adminHeaders(token), body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Lưu thất bại (${r.status})`);
  return r.json();
}

/** Lưu meta + toàn bộ content (khi sửa tên/tagline/status). */
export async function saveProject(token: string, slug: string, payload: Partial<ProjectDoc>): Promise<ProjectDoc> {
  const r = await fetch(`${API}/admin/projects/${slug}`, {
    method: "PUT", headers: adminHeaders(token), body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Lưu thất bại (${r.status})`);
  return r.json();
}

/** AI đề xuất nội dung mới cho 1 tab — KHÔNG tự lưu. */
export async function aiEditSection(
  token: string, slug: string, section: string, instruction: string, currentContent: unknown,
): Promise<AIEditOut> {
  const r = await fetch(`${API}/admin/projects/${slug}/ai-edit`, {
    method: "POST", headers: adminHeaders(token),
    body: JSON.stringify({ section, instruction, current_content: currentContent }),
  });
  if (!r.ok) throw new Error(`AI lỗi (${r.status})`);
  return r.json();
}
```

## 4. Khung trang "Dự án" với sub-tab (ráp theo UI/style của admin)

Luồng đề xuất: danh sách dự án → mở 1 dự án → giao diện sub-tab giống trang chi tiết:

```
[Nội dung] (8 tab nội dung tự do, mỗi tab có nút "Sửa bằng AI")
[Quỹ căn]  → nhúng component admin inventory hiện có (tái dùng nguyên)
[Mặt bằng] → inventory (cùng nguồn)
[Chính sách] → nhúng editor /admin/sales-policy hiện có
[Tài liệu RAG] → nhúng component learning/Drive sync hiện có
```

Mỗi tab nội dung tự do render form từ `content[section]`, có:
- Nút **Lưu** → `saveSection(token, slug, section, formData)`.
- Nút **Sửa bằng AI** → mở ô nhập yêu cầu → `aiEditSection(...)` → hiển thị
  `suggestion` (hoặc `suggestion_text` nếu AI trả thô) để admin xem trước → bấm
  **Áp dụng** thì set form = suggestion (CHƯA lưu) → admin bấm **Lưu** mới ghi.

Ví dụ rút gọn 1 tab (Tổng quan) + nút AI:

```tsx
function OverviewEditor({ token, slug, value }: { token: string; slug: string; value: ProjectContent["overview"] }) {
  const [data, setData] = useState(value);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiPreview, setAiPreview] = useState<AIEditOut | null>(null);
  const [busy, setBusy] = useState(false);

  async function runAI() {
    setBusy(true);
    try { setAiPreview(await aiEditSection(token, slug, "overview", aiInstruction, data)); }
    finally { setBusy(false); }
  }
  function applyAI() {
    if (aiPreview?.suggestion) setData(aiPreview.suggestion as ProjectContent["overview"]);
    setAiPreview(null);
  }
  async function save() { await saveSection(token, slug, "overview", data); }

  return (
    <div>
      {/* … các input cho data.rows / data.hero_images … */}
      <div>
        <input value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)}
               placeholder="VD: viết lại hấp dẫn hơn, tóm tắt, thêm USP…" />
        <button disabled={busy || !aiInstruction} onClick={runAI}>Sửa bằng AI</button>
      </div>
      {aiPreview && (
        <div>
          <p>{aiPreview.note}</p>
          <pre>{JSON.stringify(aiPreview.suggestion ?? aiPreview.suggestion_text, null, 2)}</pre>
          {aiPreview.suggestion && <button onClick={applyAI}>Áp dụng (chưa lưu)</button>}
        </div>
      )}
      <button onClick={save}>Lưu Tổng quan</button>
    </div>
  );
}
```

## 5. Gộp menu (yêu cầu của task)

- Trong file điều hướng sidebar của admin: **bỏ** 2 mục riêng "Quỹ căn" và
  "Tài liệu RAG" khỏi danh sách nav; thêm 1 mục **"Dự án"**.
- GIỮ NGUYÊN file/route trang Quỹ căn và Tài liệu RAG cũ (để không vỡ build /
  link cũ) — chỉ bỏ khỏi nav. Đưa nội dung 2 trang đó vào làm **sub-tab** bên
  trong trang "Dự án" bằng cách **tái dùng component hiện có** (import lại
  component bảng inventory + component learning), KHÔNG viết lại logic.

## 6. An toàn

- Chỉ `/admin/*` (require_admin / API key admin_full) mới sửa được.
- `/projects/{slug}` PUBLIC chỉ ĐỌC nội dung marketing (không PII).
- AI-edit CHỈ trả đề xuất — admin tự bấm Lưu (PUT/PATCH) mới ghi.
- Thiếu `ANTHROPIC_API_KEY` → AI trả `used_llm=false` + `note` hướng dẫn, không lỗi.
- Mỗi lần lưu: backend tự backup bản cũ + tăng version (xem `/history`).
