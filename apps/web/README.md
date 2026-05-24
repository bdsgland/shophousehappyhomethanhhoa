# Web Dashboard — Agent Proptech

Web dashboard cho saleman/admin, build bằng **Next.js 14 + TypeScript + Tailwind CSS**.

## Yêu cầu

- **Node.js 18+** và **npm** (xem hướng dẫn cài Node trong [README chính](../../README.md#71-cài-nodejs-trên-macos))

## Chạy local

```bash
cd apps/web

# Cài dependencies (chỉ lần đầu)
npm install

# Chạy dev server
npm run dev
```

Mở: <http://localhost:3000>

> 💡 Dashboard sẽ gọi vào agent-engine ở `http://localhost:8000`.
> Nhớ chạy agent-engine song song (xem [`apps/agent-engine/README.md`](../agent-engine/README.md)).

## Cấu trúc

```
app/
├── layout.tsx          ← Layout chung (header, navigation)
├── page.tsx            ← Trang chủ "Hello Agent Proptech"
├── globals.css         ← Tailwind base
└── leads/
    └── page.tsx        ← Trang danh sách lead
components/
├── HealthStatus.tsx    ← Kiểm tra kết nối agent-engine
└── LeadList.tsx        ← Bảng lead
lib/
└── api.ts              ← Client gọi agent-engine
```

## Build production

```bash
npm run build
npm start
```
