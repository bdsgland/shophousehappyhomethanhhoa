# Agent Engine — Backend AI

Backend Python (FastAPI) chạy AI agent của hệ thống Agent Proptech.

## Chạy local

```bash
cd apps/agent-engine

# Tạo venv (chỉ làm lần đầu)
python3 -m venv .venv
source .venv/bin/activate

# Cài thư viện
pip install -r requirements.txt

# Chạy server (tự reload khi sửa code)
uvicorn app.main:app --reload --port 8000
```

Mở:
- <http://localhost:8000/health> — kiểm tra server sống
- <http://localhost:8000/docs> — Swagger UI tự sinh (test API trực tiếp)

## Endpoint hiện có (MVP)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/` | Thông tin chung |
| POST | `/agent/chat` | Gửi tin → nhận trả lời + điểm intent |
| GET | `/leads` | Danh sách lead (in-memory) |
| POST | `/leads` | Tạo lead mới |
| GET | `/leads/{id}` | Chi tiết 1 lead |
| POST | `/leads/{id}/score?delta=N` | Cộng/trừ điểm intent |

## Chạy test

```bash
source .venv/bin/activate
pytest -v
```

## Chế độ mock LLM

Mặc định `USE_MOCK_LLM=true` (cấu hình trong `.env`) → agent trả lời giả, KHÔNG tốn token Claude.
Khi sẵn sàng test thật:
1. Đặt `ANTHROPIC_API_KEY=sk-ant-...` trong `.env` (copy từ `.env.example`)
2. Đặt `USE_MOCK_LLM=false`
3. Restart server

## Cấu trúc thư mục

```
app/
├── main.py             ← FastAPI entry point
├── core/settings.py    ← Cấu hình từ env
├── api/                ← Các router HTTP
│   ├── health.py
│   ├── chat.py
│   └── leads.py
├── agents/             ← Logic AI agent
│   └── sales_agent.py
└── schemas/            ← Pydantic models (request/response)
    ├── chat.py
    └── lead.py
tests/                  ← Pytest
requirements.txt
```
