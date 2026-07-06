# Sprint 1.1 — Runbook triển khai (Railway)

> Mục tiêu: bật **lưu trữ bền vững** cho service `shophousehappyhomethanhhoa` (agent-engine) và
> import **108 khách hàng Happy Home** vào hệ thống.
>
> Code đã sẵn trên `origin/main` (commit `ca30f58`). Railway tự deploy mỗi khi
> push main → khi anh làm các bước dưới, image đã có sẵn script import + lớp DB.
>
> **Triết lý an toàn:** Postgres và volume đều *tuỳ chọn lúc chạy*. Thiếu cấu
> hình → app vẫn chạy bình thường (không sập). Anh làm tới đâu chắc tới đó.

---

## ⛳ Bối cảnh (đọc 1 phút trước khi làm)

Hiện tại `users.json` của prod nằm trong thư mục **tạm** của container → **mất
mỗi lần deploy**, và admin được tạo lại tự động lúc khởi động. Vì vậy:

- Sau khi gắn Volume + set `DATA_DIR`, dữ liệu user (kể cả 108 khách) sẽ **nằm
  trên volume và không mất nữa**.
- Khi deploy với volume trống lần đầu, app **tự seed lại admin** từ env
  `ADMIN_EMAIL` / `ADMIN_PASSWORD`. 👉 **BẮT BUỘC đặt `ADMIN_PASSWORD` trước**
  (Bước 0) để sau deploy còn đăng nhập được. Nếu không, hệ thống sinh mật khẩu
  ngẫu nhiên và chỉ in ra log.

---

## Bước 0 — Đảm bảo có mật khẩu admin cố định (1 phút)

Railway → project **noble-gratitude** → service **shophousehappyhomethanhhoa** → tab **Variables**:

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `ADMIN_EMAIL` | `admin@bdsg.land` | nếu chưa có |
| `ADMIN_PASSWORD` | *(mật khẩu anh tự đặt, ghi nhớ lại)* | **quan trọng** để login sau deploy |

> Nếu 2 biến này đã tồn tại và anh nhớ mật khẩu → bỏ qua Bước 0.

---

## Bước A — Gắn Volume (lưu trữ bền vững)

Service **shophousehappyhomethanhhoa** → tab **Settings** (hoặc **Volumes**) → **+ New Volume** /
**Add Volume**:

| Trường | Giá trị |
|---|---|
| **Name** | `agent-engine-data` |
| **Mount path** | `/app/data` |
| **Size** | `1 GB` |

Lưu lại. (Railway sẽ xếp 1 lần redeploy — chưa cần lo, làm xong Bước B rồi mới Deploy.)

---

## Bước B — Set biến môi trường `DATA_DIR` (mấu chốt!)

Vẫn ở service **shophousehappyhomethanhhoa** → tab **Variables** → thêm:

| Biến | Giá trị |
|---|---|
| `DATA_DIR` | `/app/data` |

> Đây là biến **quyết định** việc volume có thật sự lưu user hay không. App sẽ
> ghi user vào `/app/data/data/_runtime/users.json` (đường dẫn có 2 chữ `data`
> là **đúng**, không phải lỗi) và tài liệu Learning vào `/app/data/data/learning`.

**(Tuỳ chọn — để dành Phase Postgres, CHƯA cần làm hôm nay):** nếu muốn bật
Postgres dual-write, add **Postgres** plugin vào project rồi thêm biến
`DATABASE_URL` = `${{Postgres.DATABASE_URL}}`. Thiếu biến này → app chạy JSON
thuần, hoàn toàn ổn.

---

## Bước C — Deploy (Apply changes)

Railway thường tự xếp redeploy sau khi đổi Volume/Variables. Nếu có nút
**Deploy** / **Apply N changes** → bấm để áp dụng.

- Downtime dự kiến **~30–60 giây**.
- Chờ tới khi deployment chuyển trạng thái **ACTIVE** (xanh).
- Mở tab **Deploy Logs**, tìm dòng xác nhận:
  - `[DB] Chưa cấu hình DATABASE_URL → chạy JSON thuần.` (bình thường nếu chưa làm Postgres)
  - `[SEED] Admin already exists` **hoặc** `[SEED] Admin created: ...` (admin OK)

✅ Kiểm tra nhanh service sống: mở `https://api-happyhomethanhhoa.bdsg.land/health`.

---

## Bước D — Import 108 khách (chạy trong Console của shophousehappyhomethanhhoa)

Service **shophousehappyhomethanhhoa** → mở **Console** / **Shell** (terminal trong container).

### D.1 — Đưa file Excel vào volume

File khách hàng là **PII**, không nằm trong code. Đẩy lên volume bằng base64:

**Trên máy Mac của anh** (Terminal, tại thư mục dự án):
```bash
base64 < "data/customers/happy-home-thanh-hoa/sheet-data-quang-cao-hh.xlsx" | pbcopy
```
(đã copy chuỗi base64 vào clipboard)

**Trong Console Railway**, dán vào file rồi giải mã ra Excel trên volume:
```bash
cat > /tmp/hh.b64    # dán (Cmd+V) toàn bộ chuỗi, xong nhấn Enter rồi Ctrl-D
base64 -d /tmp/hh.b64 > /app/data/sheet-data-quang-cao-hh.xlsx
ls -la /app/data/sheet-data-quang-cao-hh.xlsx   # phải thấy ~65 KB
```

### D.2 — Chạy script import

Trong Console Railway:
```bash
cd /app
. /opt/venv/bin/activate
# Xem trước (KHÔNG ghi) — phải báo "có SĐT hợp lệ: 108"
python -m app.scripts.import_customers --file /app/data/sheet-data-quang-cao-hh.xlsx --dry-run
# Import thật
python -m app.scripts.import_customers --file /app/data/sheet-data-quang-cao-hh.xlsx
```

Kết quả mong đợi (in ra ngay):
```
Đã import: 108
Bỏ qua (trùng SĐT/email): 0
Bỏ qua (không có SĐT): 136
Tổng user sau import: 112   (108 khách + admin + sale + client cũ)
```

> Script tự khử trùng lặp theo SĐT → chạy lại nhiều lần **không** tạo trùng.
> Khách không có email nên hệ thống sinh email định danh `kh-<sđt>@hh-import.local`.

### D.3 — (Tuỳ chọn) Xoá file Excel khỏi volume sau import
```bash
rm -f /app/data/sheet-data-quang-cao-hh.xlsx /tmp/hh.b64
```

---

## Bước E — Verify số lượng (`/admin/users` ≥ 108)

`/admin/users` yêu cầu token admin. Trên máy Mac (thay `<ADMIN_PASSWORD>`):

```bash
TOKEN=$(curl -s -X POST https://api-happyhomethanhhoa.bdsg.land/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bdsg.land","password":"<ADMIN_PASSWORD>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s https://api-happyhomethanhhoa.bdsg.land/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Tổng user =', len(d))"
```

✅ Kỳ vọng: **Tổng user ≥ 108** (thường là 112).

---

## ✅ Kiểm tra bền vững (quan trọng) — dữ liệu KHÔNG mất khi deploy lại

1. Railway → shophousehappyhomethanhhoa → bấm **Redeploy** (hoặc đổi 1 biến nhỏ để trigger).
2. Chờ ACTIVE, chạy lại lệnh verify ở Bước E.
3. ✅ Nếu vẫn ≥ 108 → volume hoạt động đúng, dữ liệu đã **bền vững**. 🎉

---

## 🔁 Rollback nhanh nếu có sự cố

- Lỗi không liên quan DB/volume → bỏ biến `DATA_DIR` (app quay lại đường dẫn cũ,
  vẫn chạy được; chỉ là không persist).
- Mọi lỗi Postgres/volume **không làm sập app** (đã thiết kế graceful fallback).
- Cần khôi phục code: `git revert ca30f58` (nhưng hiếm khi cần — code là tuỳ chọn runtime).

---

## 📌 Việc Phase 2 (sau sprint này)

- Add Postgres plugin + `DATABASE_URL` → bật dual-write thật (log sẽ báo
  `[DB] Postgres CONNECTED … Dual-write BẬT.`).
- Chuyển **read path** user/lead/booking từ JSON sang Postgres.
- Backup tự động: thêm Railway **Cron** chạy `python -m app.scripts.backup_db`
  hằng đêm 2h sáng + cấu hình R2 (`R2_ACCOUNT_ID`, `R2_BUCKET`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
