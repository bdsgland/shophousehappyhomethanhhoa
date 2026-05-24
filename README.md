# Agent Proptech

> **AI-agent nhân bản saleman bất động sản cao cấp.**
> Tự học dự án • Tìm khách • Chăm khách • Chấm điểm quan tâm • Bàn giao khách "nóng" cho saleman thật để chốt.

---

## 1. Tầm nhìn sản phẩm

Đội ngũ sale bất động sản cao cấp dành **80% thời gian** cho các việc lặp lại: trả lời câu hỏi cơ bản về dự án, lọc lead lạnh, nhắn tin chăm sóc rải rác trên Zalo/Facebook/email, theo đuổi khách chưa sẵn sàng. Chỉ **20% thời gian còn lại** dùng để gặp gỡ và chốt — đúng việc tạo ra doanh thu.

**Agent Proptech** đảo ngược tỉ lệ này. Một đội AI-agent sẽ:

1. **Tự học từng dự án** — biết rõ giá, mặt bằng, pháp lý, tiện ích, chính sách bán hàng → trả lời chính xác như một sale đã làm dự án nhiều tháng.
2. **Tìm khách tiềm năng** — thu thập lead từ nhiều kênh (form web, landing page, quảng cáo, mạng xã hội).
3. **Chăm sóc khách 24/7** — hội thoại tự nhiên qua web chat, Zalo, Facebook Messenger, email; giọng điệu sang trọng, cá nhân hoá.
4. **Chấm điểm mức độ quan tâm** — phân tích hội thoại + hành vi để xác định khách nào đang thật sự "nóng".
5. **Bàn giao cho saleman thật** — khi khách đủ ngưỡng quan tâm, tự động gửi cảnh báo + tóm tắt hội thoại cho saleman để gặp và chốt.

Kết quả: **saleman chỉ làm việc cuối phễu** — gặp khách đã thật sự quan tâm. Hiệu suất đội sale tăng nhiều lần mà không cần tuyển thêm người.

> ⚠️ Phân khúc tập trung: **bất động sản CAO CẤP** (căn hộ hạng sang, biệt thự, shophouse premium…). KHÔNG phục vụ nhà ở xã hội/NOXH.

---

## 2. Các module chính

| # | Module | Vai trò | Công nghệ chủ đạo |
|---|---|---|---|
| 1 | **Project Knowledge / RAG** | Nạp & truy xuất thông tin dự án bằng tìm kiếm ngữ nghĩa | Vector DB (pgvector) + LLM |
| 2 | **Lead Generation** | Thu thập lead từ form web, landing page, kênh marketing | Next.js form + webhook |
| 3 | **Conversational Nurturing** | Hội thoại tự động đa kênh với khách | LLM orchestration + tích hợp Zalo/FB/Email |
| 4 | **Lead Scoring** | Chấm điểm intent dựa trên hội thoại + hành vi | LLM phân tích + rule engine |
| 5 | **Handoff & CRM** | Bàn giao lead nóng cho saleman, theo dõi trạng thái | Dashboard + notification |

---

## 3. Luồng phễu bán hàng

```
        [Quảng cáo / Landing page / Form web]
                       │
                       ▼
              ┌─────────────────┐
              │  Lead Gen       │  ← thu thập thông tin cơ bản
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  AI Agent chat  │  ← chăm sóc 24/7, trả lời, tư vấn
              │  (RAG dự án)    │     (Web chat / Zalo / Messenger / Email)
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Lead Scoring   │  ← chấm điểm sau mỗi tương tác
              └────────┬────────┘
                       │
              điểm ≥ ngưỡng "nóng"
                       │
                       ▼
              ┌─────────────────┐
              │  Handoff        │  ← gửi cảnh báo + tóm tắt cho saleman
              └────────┬────────┘
                       │
                       ▼
              [Saleman thật gặp & chốt]
```

---

## 4. Roadmap

### 🟢 Giai đoạn 1 — MVP (4–8 tuần)
- Quản lý 1 dự án mẫu (nạp tài liệu, RAG cơ bản)
- Web chat trên 1 landing page
- Chấm điểm intent đơn giản (rule + LLM)
- Dashboard liệt kê lead + bàn giao thủ công cho saleman
- Mục tiêu: chứng minh agent có thể nói chuyện thông minh về dự án và sàng lọc được lead "ấm" vs "lạnh"

### 🟡 Giai đoạn 2 — Production sẵn sàng
- Quản lý nhiều dự án song song
- Tích hợp **Zalo OA** (kênh nhắn tin chính tại VN)
- Tích hợp Facebook Messenger
- Notification cho saleman (email/Zalo/Telegram)
- Báo cáo conversion theo dự án / theo kênh
- Tự động lên lịch theo dõi khách chưa phản hồi

### 🔵 Giai đoạn 3 — Mở rộng
- Voice agent gọi điện tự động (TTS/STT tiếng Việt)
- Cá nhân hoá nội dung quảng cáo theo từng lead
- A/B test kịch bản chăm sóc
- Tích hợp CRM hiện có (Salesforce, HubSpot, hoặc CRM nội bộ)
- Phân tích hành vi nâng cao (theo dõi mức độ quan tâm theo thời gian)

---

## 5. Cấu trúc thư mục

```
Agent-Proptech/
├── README.md                   ← Tài liệu này
├── .env.example                ← Mẫu biến môi trường (KHÔNG chứa khoá thật)
├── .gitignore
├── docs/
│   └── ARCHITECTURE.md         ← Kiến trúc kỹ thuật chi tiết
├── apps/
│   ├── agent-engine/           ← Backend Python — AI agent (FastAPI)
│   │   ├── app/
│   │   │   ├── main.py         ← Entry point FastAPI
│   │   │   ├── api/            ← Các endpoint HTTP
│   │   │   ├── core/           ← Cấu hình, settings
│   │   │   ├── agents/         ← Logic AI agent (RAG, scoring…)
│   │   │   └── schemas/        ← Pydantic models
│   │   ├── requirements.txt
│   │   └── README.md
│   └── web/                    ← Frontend Next.js — Dashboard saleman
│       ├── app/                ← Next.js App Router
│       ├── components/
│       ├── package.json
│       └── README.md
└── data/                       ← Dữ liệu dự án mẫu (không commit dữ liệu nhạy cảm)
```

---

## 6. Cách chạy thử

### 6.1 Yêu cầu

- **macOS / Linux / Windows** với:
  - **Python 3.9+** (đã có sẵn trên macOS)
  - **Node.js 18+** và **npm** (cần cài thêm — xem hướng dẫn bên dưới)
  - **Git**

### 6.2 Chạy agent-engine (backend Python)

```bash
cd apps/agent-engine

# Tạo virtual environment Python
python3 -m venv .venv
source .venv/bin/activate

# Cài thư viện
pip install -r requirements.txt

# Chạy server (mặc định cổng 8000)
uvicorn app.main:app --reload --port 8000
```

Sau đó mở trình duyệt: <http://localhost:8000/health> — sẽ thấy `{"status":"ok",...}`.
Xem API docs tự sinh: <http://localhost:8000/docs>.

### 6.3 Chạy web dashboard (Next.js)

> **Cần cài Node.js trước** (xem mục [Hướng dẫn cài Node.js](#71-cài-nodejs-trên-macos)).

```bash
cd apps/web

# Cài dependencies (chỉ chạy lần đầu)
npm install

# Chạy dev server (mặc định cổng 3000)
npm run dev
```

Mở trình duyệt: <http://localhost:3000>.

### 6.4 File biến môi trường

Copy file mẫu rồi điền khoá thật vào:

```bash
cp .env.example .env
# Mở .env bằng editor và điền ANTHROPIC_API_KEY=... cùng các khoá khác
```

**Tuyệt đối KHÔNG commit file `.env` lên git** (đã có trong `.gitignore`).

---

## 7. Phụ lục — Cài đặt môi trường

### 7.1 Cài Node.js trên macOS

Cách 1 (đơn giản nhất, dùng Homebrew):

```bash
# Cài Homebrew nếu chưa có
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Cài Node.js LTS
brew install node

# Kiểm tra
node --version   # nên ≥ v18
npm --version
```

Cách 2 (dùng nvm — quản nhiều phiên bản Node):

```bash
brew install nvm
mkdir -p ~/.nvm
# Thêm vào ~/.zshrc:
#   export NVM_DIR="$HOME/.nvm"
#   [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
nvm install --lts
nvm use --lts
```

### 7.2 Khoá API cần có

- **`ANTHROPIC_API_KEY`** — bắt buộc cho LLM (Claude). Tạo tại <https://console.anthropic.com>.
- (Tuỳ chọn các giai đoạn sau) `ZALO_OA_TOKEN`, `FACEBOOK_PAGE_TOKEN`, `DATABASE_URL`…

---

## 8. Đóng góp

Đây là dự án nội bộ. Khi commit, vui lòng viết commit message bằng tiếng Việt theo định dạng:

```
<loại>: <mô tả ngắn>

Ví dụ:
feat: thêm endpoint chấm điểm lead
fix: sửa lỗi RAG không trả về tài liệu mới nhất
docs: cập nhật roadmap giai đoạn 2
```

---

## 9. Giấy phép

Sở hữu nội bộ — chưa công khai mã nguồn.
