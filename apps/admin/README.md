# ELC Admin Dashboard

Cổng quản trị trung tâm cho hệ thống **Eurowindow Light City (ELC) Proptech**.
Deploy tại `admin.eurowindowlightcity.net`.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + UI primitives tự viết (phong cách shadcn/ui)
- TanStack React Query (fetch + cache)
- Recharts (biểu đồ KPI)
- Lucide icons
- Auth: JWT từ FastAPI `api.eurowindowlightcity.net` — **chỉ chấp nhận role=admin**

## Chạy local

```bash
cd apps/admin
npm install
cp .env.example .env.local   # chỉnh NEXT_PUBLIC_API_URL nếu cần
npm run dev                  # http://localhost:3001
```

> Backend (`apps/agent-engine`) phải chạy và cho phép CORS từ `http://localhost:3001`
> (đã thêm sẵn trong `settings.cors_allow_origins`).

## Biến môi trường (Vercel)

| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.eurowindowlightcity.net` |
| `NEXT_PUBLIC_CHATWOOT_URL` | `https://chat.eurowindowlightcity.net` |

## Cấu trúc

```
app/
  layout.tsx          Root layout + React Query provider
  login/page.tsx      Đăng nhập (chỉ admin)
  (dash)/             Khu vực đã đăng nhập (AdminGuard + Sidebar)
    layout.tsx
    page.tsx          Dashboard tổng quan (KPI + chart + feed)
    users/page.tsx    Danh sách người dùng (read-only)
    platforms/page.tsx Health 5 nền tảng
    sales|inventory|kb|conversations|settings  Stub phase 2
components/           ui/, nav/, kpi/, charts/, platforms/, auth/
lib/                  api.ts, auth.ts, platforms.ts, types.ts, utils.ts
middleware.ts         Chặn route admin khi chưa có token
```

## Phase tiếp theo

Xem mục "Phase 2 todo" trong báo cáo bàn giao của session khởi tạo.
