# Báo cáo chẩn đoán + Checklist khắc phục Email & Đồng bộ Google Trang tính

**Dự án:** Agent-Proptech — `apps/agent-engine` (FastAPI)
**Ngày:** 2026-06-12
**Kết luận tổng quát:** Code đã **đúng kiến trúc**, không có bug chặn đường. Cả 2 lỗi (gửi email, đồng bộ Sheet) đều do **cấu hình phía Google Cloud + token Google Workspace cũ thiếu quyền (scope)**. **KHÔNG cần sửa code** — chỉ cần bật API trong Google Cloud Console và **bấm "Kết nối Google Workspace" lại 1 lần** để token được cấp thêm quyền mới.

---

## A) LUỒNG EMAIL

### Hiện code gửi email bằng gì?
File `app/api/openclaw_bridge.py` → hàm `_send_email()` (dòng 253):

1. **Ưu tiên Gmail API** (HTTPS, cổng 443) qua `gmail_sender.send_email()` — nếu `gmail_sender.is_available()` = True.
2. **Fallback SMTP** (`_send_email_smtp`, ép IPv4) — chỉ khi Gmail API chưa sẵn sàng hoặc lỗi, **và** có cấu hình SMTP host.

`gmail_sender.is_available()` = `is_connected()` **VÀ** `has_send_scope()`:
- `is_connected()`: có `client_id` + `client_secret` + refresh token (store hoặc env).
- `has_send_scope()`: trong scope đã lưu của token có `https://www.googleapis.com/auth/gmail.send`.

### Vì sao SMTP fail trên Railway?
Container Railway **chặn cổng SMTP outbound** (smtp.gmail.com:587 / 465 bị timeout). Vì vậy SMTP **không** dùng được trên production → **bắt buộc phải dùng Gmail API** (chạy HTTPS/443, không bị chặn). Điều này đã được ghi rõ trong docstring code và là lý do `gmail_sender.py` ra đời.

### Tại sao email hiện KHÔNG gửi được?
Refresh token Google Workspace hiện tại được lấy **trước khi** scope `gmail.send` được thêm vào `_WORKSPACE_SCOPES`. Nên:
- `has_send_scope()` = **False** → `is_available()` = **False**
- → `_send_email()` bỏ qua Gmail API, rơi xuống SMTP → SMTP bị Railway chặn → **fail**.

### ĐỂ CHẠY ĐƯỢC, cần:
1. **Bật Gmail API** trong Google Cloud Console (đúng project chứa OAuth Client ID đang dùng — chính là project của `GOOGLE_OAUTH_CLIENT_ID`).
2. **OAuth consent screen** phải có scope `.../auth/gmail.send` (thêm vào danh sách scope; nếu app ở chế độ Testing thì thêm tài khoản admin vào Test users).
3. **NGƯỜI DÙNG PHẢI BẤM "KẾT NỐI GOOGLE WORKSPACE" LẠI** trong trang admin → để Google cấp lại refresh token **có** scope `gmail.send` (token cũ thiếu scope này nên vô hiệu).
4. **Địa chỉ "From" hợp lệ**: để trống `SMTP_FROM` thì Gmail tự dùng địa chỉ tài khoản đã kết nối (an toàn nhất); hoặc đặt `SMTP_FROM` = đúng email của tài khoản Workspace đã kết nối.

### Cách kiểm tra token hiện có scope gì
- Gọi endpoint admin: `GET /admin/import/workspace-status` → xem mảng `scopes` và cờ `sheets_ready`.
- Hoặc `GET /admin/google-workspace/status` → `connected`, `scopes`, `email`, `redirect_uri`.
- Hoặc health: `GET .../platforms/health` → mục `email_google` có `connected` / `has_send_scope`.
- Nếu trong `scopes` **không** thấy `https://www.googleapis.com/auth/gmail.send` → token thiếu quyền → kết nối lại.

> ⚠️ Lưu ý: nếu đang dùng refresh token qua **env `GOOGLE_WORKSPACE_REFRESH_TOKEN`** (không qua nút Connect), `has_send_scope()` luôn trả **False** (vì store rỗng, không biết scope) → Gmail API sẽ không bao giờ được dùng. **Giải pháp: bấm nút "Kết nối Google Workspace"** để lưu token + scope vào store (`data/_runtime/google_workspace.json`), thay vì dựa vào env.

---

## B) LUỒNG GOOGLE TRANG TÍNH (đồng bộ khách)

### Code đọc sheet thế nào?
- `app/api/admin_import.py` → `POST /admin/import/google-sheet/parse`:
  - `sheets_import.extract_spreadsheet_id(url)` tách `<ID>` từ link.
  - `sheets_import.list_sheet_tabs(id)` (Sheets API meta) + `read_sheet_values(id, sheet_name)` (Sheets API values).
- `app/core/sheets_import.py` gọi **Google Sheets API v4**:
  - Meta: `GET https://sheets.googleapis.com/v4/spreadsheets/{id}`
  - Values: `GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{tab}`
  - Lấy access token bằng **refresh token Workspace** (`google_meet.get_workspace_access_token`).
- **KHÔNG đọc public** — luôn đi qua OAuth token của tài khoản đã kết nối. Nên sheet **phải** mà tài khoản đó có quyền xem.

### Cần bật API gì? Scope gì?
- **Bật:** Google Sheets API (bắt buộc) + Google Drive API (nên bật kèm để truy cập file).
- **Scope cần:** `https://www.googleapis.com/auth/spreadsheets.readonly` (+ `drive.readonly` đã có sẵn). Cả hai đã nằm trong `_WORKSPACE_SCOPES` → chỉ cần kết nối lại để token được cấp.

### Sheet phải được chia sẻ thế nào?
Vì đọc qua tài khoản đã kết nối (không phải public-fetch): **chia sẻ file Trang tính cho đúng email tài khoản Workspace đã kết nối** (quyền Người xem là đủ), hoặc đặt link "Bất kỳ ai có đường liên kết → Người xem".

### Định dạng link chấp nhận
- `https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0`
- `https://docs.google.com/spreadsheets/d/<ID>/...`
- `...?id=<ID>`
- Hoặc dán thẳng `<ID>`.

> ⚠️ Code đọc theo **tên tab** (`sheet_name`), **không** theo `gid`. Nếu dữ liệu nằm ở tab không phải tab đầu mà không chọn đúng tên tab, hệ thống sẽ đọc tab đầu tiên. → Chọn đúng tên tab khi import.

### Lỗi hay gặp (Sheet)
| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| 403 khi đọc | Token thiếu scope `spreadsheets.readonly` HOẶC Sheets API chưa bật | Bật Sheets API + Kết nối lại Workspace |
| 404 | Sai ID, hoặc tài khoản kết nối không có quyền xem file | Chia sẻ sheet cho đúng email đã kết nối / kiểm tra link |
| 409 "Chưa kết nối" | Chưa có refresh token | Bấm "Kết nối Google Workspace" |
| Đọc nhầm dữ liệu | Chọn sai tab (gid bị bỏ qua) | Chọn đúng tên tab |
| Link không hợp lệ (400) | Link sai định dạng | Dán link `/spreadsheets/d/<ID>/edit` |

---

## C) CHECKLIST "BẬT GÌ BÊN GOOGLE" (làm từng bước, cho người không rành)

### Bước 1 — Vào Google Cloud Console
1. Mở https://console.cloud.google.com
2. Góc trên cùng, **chọn đúng project** chứa OAuth Client ID đang dùng (chính là project tạo `GOOGLE_OAUTH_CLIENT_ID`). Nếu không chắc, mở **APIs & Services → Credentials** và đối chiếu Client ID với biến môi trường trên Railway.

### Bước 2 — Bật (Enable) các API cần thiết
Vào **APIs & Services → Library**, tìm và bấm **Enable** lần lượt:
- ✅ **Gmail API** (để gửi email)
- ✅ **Google Sheets API** (để đọc Trang tính)
- ✅ **Google Drive API** (truy cập file)
- ✅ **Google Calendar API** (để tạo Google Meet — nếu dùng Live Match)

### Bước 3 — OAuth consent screen: thêm scope
Vào **APIs & Services → OAuth consent screen → Edit → Scopes → Add or remove scopes**, thêm:
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/calendar.events`

> Nếu app đang ở chế độ **Testing**: vào phần **Test users**, thêm email tài khoản admin sẽ kết nối. (Các scope như gmail.send là "sensitive/restricted" — ở Testing thì dùng được với Test users mà chưa cần Google verify.)

### Bước 4 — Kiểm tra Authorized redirect URIs
Vào **APIs & Services → Credentials → (OAuth Client) → Authorized redirect URIs**, đảm bảo có cả 2 URI khớp domain production:
- `.../auth/google/callback` (= `GOOGLE_OAUTH_REDIRECT_URI`)
- `.../auth/workspace/callback` (= `GOOGLE_WORKSPACE_REDIRECT_URI`, hoặc suy ra từ host của cái trên)

### Bước 5 — Kết nối lại Google Workspace trong admin (QUAN TRỌNG NHẤT)
1. Vào trang quản trị → **Cài đặt → Tích hợp** → bấm **"Kết nối Google Workspace"**.
2. Đăng nhập tài khoản Google (tài khoản sẽ gửi email + có quyền xem các Sheet).
3. Ở màn hình đồng ý, **tick/cho phép tất cả quyền** (Gmail gửi, Sheets, Drive, Calendar).
4. Thấy trang "Đã kết nối thành công" là xong.

> Vì sao bắt buộc bước này: token cũ được cấp trước khi thêm scope `gmail.send` + `spreadsheets.readonly`. Phải cấp lại để token mới có đủ quyền.

### Bước 6 — Kiểm tra lại
- `GET /admin/import/workspace-status` → `sheets_ready: true` và `scopes` chứa `spreadsheets`.
- `GET .../platforms/health` → `email_google.has_send_scope: true`.
- Gửi thử 1 email + import thử 1 Google Sheet đã chia sẻ.

---

## D) BUG CODE?

**Không phát hiện bug code thật sự.** Cụ thể đã kiểm tra:
- `_WORKSPACE_SCOPES` (google_oauth.py) đã có đủ 4 scope, chuỗi nối đúng (có dấu cách phân tách, không thừa/thiếu).
- `_send_email()` ưu tiên Gmail API → fallback SMTP đúng logic; thông báo lỗi rõ ràng.
- `sheets_import` bắt lỗi 403/404 và báo người dùng kết nối lại — hợp lý.
- Token store lưu scope + refresh token đúng; status endpoints phản ánh đúng trạng thái.

➡️ **KHÔNG cần sửa code, chỉ cần cấu hình Google** theo phần C. Vì vậy **không có thay đổi nào để commit/push**.

### (Tùy chọn) Cải thiện nhỏ — KHÔNG bắt buộc
Nếu muốn trải nghiệm tốt hơn (không phải bug), có thể cân nhắc sau này:
- Trong `workspace_oauth.workspace_callback`, lưu kèm `email` của tài khoản kết nối (gọi userinfo) để `connected_email()` hoạt động và dùng làm địa chỉ "From".
- Cập nhật nội dung trang HTML "Đã kết nối thành công" để nhắc thêm quyền Gmail + Sheets (hiện chỉ nhắc Meet + Drive).

Nếu sau này áp dụng các cải thiện trên thì lệnh git sẽ là:
```bash
cd apps/agent-engine
python -m py_compile app/api/workspace_oauth.py app/core/google_oauth.py
git add app/api/workspace_oauth.py
git commit -m "feat(workspace): lưu email tài khoản kết nối + cập nhật thông báo scope Gmail/Sheets"
# KHÔNG tự push — chờ người dùng duyệt rồi: git push
```
(Hiện tại **chưa thực hiện** thay đổi nào.)
