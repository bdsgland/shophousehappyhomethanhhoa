# Kiến trúc kỹ thuật — Agent Proptech

> Tài liệu này giải thích **kiến trúc**, **lựa chọn công nghệ** và **lý do** đằng sau từng quyết định. Đối tượng đọc: dev tham gia dự án, đối tác kỹ thuật, hoặc chính chủ dự án khi muốn hiểu sâu hơn.

---

## 1. Nguyên tắc thiết kế

1. **Đơn giản trước, mở rộng sau.** MVP phải chạy được trên 1 máy local, không phụ thuộc hạ tầng phức tạp. Khi cần scale, từng module có thể tách ra service riêng.
2. **Tách biệt 2 phần rõ ràng:**
   - **Agent engine** (Python) — nơi LLM, RAG, scoring sống. Tối ưu cho AI/ML.
   - **Web dashboard** (TypeScript) — nơi saleman/admin tương tác. Tối ưu cho UX.
3. **Stateless API ở giữa.** Hai phần giao tiếp qua HTTP/JSON → có thể deploy độc lập, dễ test.
4. **Ưu tiên thư viện chuẩn ngành**, tránh framework hiếm để dễ tìm tài liệu/người làm sau.
5. **Bảo mật mặc định:** không log thông tin khách hàng nhạy cảm, khoá API qua biến môi trường.

---

## 2. Sơ đồ tổng thể

```
┌──────────────────────────────────────────────────────────────────────┐
│                            NGƯỜI DÙNG                                │
│   Khách hàng tiềm năng        |        Saleman / Admin nội bộ        │
└──────────────┬───────────────────────────────────┬───────────────────┘
               │                                   │
               ▼                                   ▼
   ┌────────────────────────┐         ┌────────────────────────────┐
   │  Landing page / Chat   │         │  Web Dashboard             │
   │  widget (Next.js)      │         │  (Next.js + Tailwind)      │
   │  • Form thu thập lead  │         │  • Danh sách lead          │
   │  • Chat real-time      │         │  • Chi tiết hội thoại      │
   │  • Zalo/FB webhook ↘   │         │  • Cấu hình dự án          │
   └───────────┬────────────┘         └─────────────┬──────────────┘
               │  HTTP/JSON                         │  HTTP/JSON
               ▼                                    ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │              AGENT ENGINE  (Python / FastAPI)                    │
   │                                                                  │
   │   ┌─────────────┐  ┌─────────────┐  ┌──────────────┐             │
   │   │  Project    │  │ Conversation│  │ Lead Scoring │             │
   │   │  Knowledge  │  │ Orchestrator│  │  Engine      │             │
   │   │  (RAG)      │  │  (LLM)      │  │              │             │
   │   └──────┬──────┘  └──────┬──────┘  └──────┬───────┘             │
   │          │                │                │                     │
   │          ▼                ▼                ▼                     │
   │   ┌──────────────────────────────────────────────┐               │
   │   │   Anthropic Claude API (LLM provider)        │               │
   │   └──────────────────────────────────────────────┘               │
   └────────────────────┬─────────────────────────────────────────────┘
                        │
                        ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  LƯU TRỮ                                                         │
   │  • PostgreSQL + pgvector  — lead, hội thoại, vector dự án        │
   │  • Object storage (S3/R2) — file PDF brochure, hình ảnh dự án    │
   │  • Redis (tuỳ chọn)       — cache hội thoại, rate limit          │
   └──────────────────────────────────────────────────────────────────┘
```

---

## 3. Lựa chọn công nghệ & lý do

### 3.1 Frontend — Next.js 14 (App Router) + TypeScript + Tailwind CSS

**Vì sao chọn:**
- **Next.js** là framework React phổ biến nhất, có server components + API routes → vừa làm dashboard, vừa làm landing page, vừa có chỗ đặt webhook nhẹ.
- **TypeScript** — bắt lỗi type ngay khi code, giảm bug ở production.
- **Tailwind CSS** — viết style nhanh, không cần đặt tên class, UI nhất quán.

**Trade-off:**
- Next.js phức tạp hơn React thuần. Đổi lại: SEO tốt cho landing page, ít cấu hình build.
- Tailwind cần thời gian quen. Đổi lại: code UI nhanh hơn rất nhiều khi đã quen.

**Lựa chọn thay thế đã cân nhắc:**
- **Remix / SvelteKit** — đẹp nhưng cộng đồng VN nhỏ hơn.
- **Vue + Nuxt** — tốt, nhưng React/Next có nhiều thư viện AI chat sẵn (Vercel AI SDK).

### 3.2 Backend AI — Python 3.10+ + FastAPI

**Vì sao chọn:**
- **Python** là ngôn ngữ chuẩn ngành cho AI/ML — mọi SDK LLM, vector DB, embedding model đều có Python binding tốt nhất.
- **FastAPI** — framework HTTP async hiện đại, tự sinh OpenAPI docs, validate input qua Pydantic.

**Trade-off:**
- Python chậm hơn Go/Rust ở CPU-bound, nhưng workload chính là I/O (gọi LLM API) → không phải vấn đề.

**Lựa chọn thay thế đã cân nhắc:**
- **Node.js + LangChain.js** — gộp 1 ngôn ngữ với frontend. Nhưng hệ sinh thái AI/RAG còn non hơn Python.

### 3.3 LLM — Anthropic Claude

**Vì sao chọn:**
- **Chất lượng hội thoại tiếng Việt** tốt, ít "ảo giác" hơn nhiều mô hình khác.
- **Context window lớn** (200K+ tokens) — nhồi được nhiều tài liệu dự án vào prompt mà không cần RAG quá phức tạp ở MVP.
- **Tool use & structured output** mạnh — phù hợp orchestrate agent đa bước.

**Trade-off:**
- Giá cao hơn một số model open-source. Đổi lại: chất lượng vượt trội cho phân khúc cao cấp (không được sai sót).

**Mở rộng tương lai:** có thể thêm fallback dùng Gemini hoặc model open-source self-hosted (vLLM) khi volume lớn.

### 3.4 RAG — Bắt đầu đơn giản, nâng cấp dần

**Giai đoạn MVP:**
- Lưu tài liệu dự án (mô tả, FAQ, brochure đã trích text) thành chunk ~500 token.
- Embedding qua **`voyage-multilingual-2`** (Voyage AI — partner Anthropic, hỗ trợ tiếng Việt tốt) hoặc **OpenAI `text-embedding-3-small`** (cũng tốt, rẻ).
- Lưu vector vào **pgvector** (extension của PostgreSQL) — không cần thêm vector DB riêng.
- Truy xuất top-k chunk theo cosine similarity, ghép vào prompt Claude.

**Giai đoạn 2:**
- Hybrid search (vector + BM25/Postgres full-text).
- Re-ranking với Cohere Rerank.
- Tách context theo loại dữ liệu (giá, pháp lý, tiện ích…) để retrieve có chủ đích hơn.

**Lựa chọn thay thế đã cân nhắc:**
- **Pinecone / Weaviate / Qdrant** — vector DB chuyên dụng. Mạnh hơn nhưng thêm 1 dịch vụ phải quản lý.
- Bắt đầu với **pgvector** rồi đổi sau nếu cần là quyết định bảo thủ hợp lý.

### 3.5 Database — PostgreSQL 15+ với pgvector

**Vì sao chọn:**
- Một database lo nhiều việc: dữ liệu giao dịch (lead, message, user) + tìm kiếm vector (RAG).
- Mature, dễ deploy ở mọi cloud (Supabase, Neon, RDS, self-hosted).

**Trade-off:**
- Khi volume vector rất lớn (hàng triệu chunk) thì pgvector chậm hơn DB chuyên dụng. Với 1–10 dự án BĐS cao cấp, vẫn dư sức.

### 3.6 Tích hợp kênh nhắn tin

| Kênh | Ưu tiên | Cách tích hợp |
|---|---|---|
| **Web chat widget** | Giai đoạn 1 | Component React tự build, gọi backend qua HTTP |
| **Zalo Official Account** | Giai đoạn 2 | Zalo Developers API + webhook |
| **Facebook Messenger** | Giai đoạn 2 | Meta Graph API + webhook |
| **Email** | Giai đoạn 2 | Resend hoặc SendGrid (gửi), webhook (nhận) |
| **SMS / Voice call** | Giai đoạn 3 | Twilio hoặc nhà mạng VN |

### 3.7 Triển khai (Deployment)

**Khuyến nghị (rẻ + nhanh để bắt đầu):**
- **Frontend (Next.js):** Vercel — free tier đủ chạy MVP, deploy bằng `git push`.
- **Backend (FastAPI):** Railway hoặc Render — cũng deploy theo git, có free tier khởi đầu.
- **Database:** Supabase hoặc Neon — Postgres managed có pgvector sẵn.
- **File storage:** Cloudflare R2 (rẻ hơn S3 nhiều).

**Khi scale:**
- Tách backend thành nhiều service (chat orchestrator, scoring worker, RAG indexer).
- Dùng queue (Redis/SQS) cho việc nặng (re-indexing tài liệu, scoring batch).
- Container hoá bằng Docker, deploy lên AWS ECS / Fly.io / k8s.

---

## 4. Mô hình dữ liệu cốt lõi (sơ bộ)

```sql
-- Dự án bất động sản
projects (
  id, name, slug, developer, location,
  price_range, target_segment, status,
  created_at, updated_at
)

-- Tài liệu thuộc dự án (cho RAG)
project_documents (
  id, project_id, title, source_url, content_text,
  doc_type,  -- 'brochure' | 'faq' | 'pricing' | 'legal' | ...
  created_at
)

-- Vector chunks (RAG)
project_chunks (
  id, document_id, chunk_index, content,
  embedding VECTOR(1024),  -- pgvector
  metadata JSONB
)

-- Lead (khách tiềm năng)
leads (
  id, full_name, phone, email, source_channel,
  interested_project_id, status,        -- 'new'|'nurturing'|'hot'|'handed_off'|'lost'
  intent_score INT,                     -- 0..100
  assigned_saleman_id, created_at, updated_at
)

-- Phiên hội thoại
conversations (
  id, lead_id, channel,                 -- 'web'|'zalo'|'messenger'|'email'
  started_at, last_message_at, summary
)

-- Tin nhắn trong hội thoại
messages (
  id, conversation_id, role,            -- 'user'|'assistant'|'system'
  content, tokens_in, tokens_out,
  created_at
)

-- Lịch sử chấm điểm
lead_score_events (
  id, lead_id, score_delta, reason, created_at
)

-- Saleman
salesmen (
  id, full_name, phone, email, active_projects []
)
```

---

## 5. Luồng dữ liệu quan trọng

### 5.1 Khách gửi tin nhắn → Agent trả lời

```
Khách gõ tin → Web chat → POST /agent/chat
  → Agent Engine:
    1. Load conversation history
    2. Detect project context (slug hoặc inference)
    3. RAG: embed query → tìm top-k chunk từ project_chunks
    4. Build prompt: system + project context + history + chunks + user message
    5. Gọi Claude → stream response về client
    6. Lưu message (user + assistant) vào DB
    7. Trigger async: lead scoring (xem 5.2)
```

### 5.2 Chấm điểm intent sau mỗi tin nhắn

```
Sau khi lưu message:
  → Worker (hoặc inline nếu MVP):
    1. Lấy N tin nhắn gần nhất của lead
    2. Gọi Claude với prompt scoring:
       "Phân tích hội thoại và trả về JSON:
        { score_delta: -5..+20, reason: '...', signals: [...] }"
    3. Cộng dồn vào leads.intent_score
    4. Nếu score ≥ ngưỡng "nóng" (vd 70):
       → set lead.status = 'hot'
       → trigger handoff (xem 5.3)
```

### 5.3 Bàn giao lead nóng cho saleman

```
Khi lead chuyển 'hot':
  1. Chọn saleman phù hợp (round-robin / theo dự án / theo location)
  2. Tạo bản tóm tắt hội thoại bằng Claude (3–5 bullet)
  3. Gửi notification (Zalo/email/Telegram) cho saleman
  4. Hiện trên dashboard: lead xuất hiện ở "Cần xử lý"
  5. Agent gửi tin nhắn cuối cho khách: "Em sẽ kết nối anh/chị với chuyên viên phụ trách dự án trong ít phút..."
```

---

## 6. Bảo mật & tuân thủ

- **Khoá API (Anthropic, Zalo, FB…):** chỉ lưu trong biến môi trường, không commit. Production dùng secrets manager.
- **Dữ liệu khách (SĐT, email):** mã hoá at-rest qua DB-level encryption; không log full vào file log.
- **Rate limit** tại endpoint công khai để tránh abuse.
- **Audit log** mọi hành động của saleman trên dashboard (ai xem lead nào, khi nào, làm gì).
- **PDPL (Luật BVDLCN VN):** thu thập lead phải có consent rõ ràng trên form; có chức năng xoá dữ liệu khi khách yêu cầu.

---

## 7. Quan sát & đo lường (Observability)

Bắt đầu nhẹ, đủ để debug & cải tiến:
- **Log có cấu trúc** (JSON) qua `structlog` (Python) / `pino` (Node).
- **Trace LLM call** — lưu prompt + response + token count vào DB (bảng `llm_call_log`) để debug và tính chi phí.
- **Metric chính cần track từ ngày 1:**
  - Số lead mới / ngày / kênh
  - Tỉ lệ lead "ấm" → "nóng"
  - Thời gian phản hồi trung bình của agent
  - Chi phí LLM trung bình / lead
  - Tỉ lệ chốt sau handoff (cần saleman cập nhật)

---

## 8. Quyết định kiến trúc còn để mở

Các quyết định sau cố tình **chưa chốt** ở giai đoạn này, sẽ chốt khi có dữ liệu thực:

- **Có dùng framework agent (LangChain / LangGraph / Anthropic Agent SDK) hay tự build orchestration?** → MVP tự build cho hiểu rõ; sẽ đánh giá lại ở giai đoạn 2.
- **Voice agent dùng nhà cung cấp nào** (ElevenLabs / Cartesia / VNG AI Voice)? → khảo sát chất lượng giọng tiếng Việt khi đến giai đoạn 3.
- **CRM tích hợp hay tự build CRM mini?** → phụ thuộc đội sale hiện đang dùng gì.

---

## 9. Tài liệu liên quan

- [README.md](../README.md) — Tầm nhìn sản phẩm & cách chạy thử
- [apps/agent-engine/README.md](../apps/agent-engine/README.md) — Chi tiết backend
- [apps/web/README.md](../apps/web/README.md) — Chi tiết dashboard
