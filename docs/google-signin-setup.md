# Hướng dẫn cấu hình Đăng nhập Google (Google Sign-in)

Tài liệu này dành cho anh **PHAM VAN THU** làm theo **sau khi code đã xong**, để
bật tính năng "Đăng nhập với Google" cho khách hàng, sale và admin của hệ thống
Eurowindow Light City (ELC).

> ⚠️ **Quan trọng:** Đăng nhập Google là **tính năng bổ sung**. Luồng đăng nhập
> bằng email + mật khẩu cũ **vẫn hoạt động bình thường**, không bị thay thế.

---

## 0. Tổng quan luồng

```
Người dùng bấm "Đăng nhập với Google"
   → Web/Admin chuyển sang  GET /auth/google/login?role=client|sale|admin
   → Backend redirect sang trang đồng ý của Google
   → Người dùng chọn tài khoản Google
   → Google gọi về  GET /auth/google/callback?code=...&state=...
   → Backend đổi code lấy email/tên/avatar, tạo hoặc dùng lại tài khoản,
     phát JWT, rồi redirect về  {portal}/auth/callback#token=...&new_user=...
   → Trang /auth/callback lưu token vào cookie và đưa người dùng vào đúng khu vực
```

---

## 1. Vì sao phải tạo OAuth client **External** RIÊNG

Anh đang có 1 OAuth client kiểu **Internal** (chỉ cho người trong tổ chức
`eurowindowlightcity.net`). Client đó **không dùng được** cho Sign-in vì khách
hàng cá nhân (Gmail thường) sẽ **không đăng nhập được**.

➡️ Phải **tạo 1 OAuth client mới kiểu "External"** RIÊNG cho Sign-in:

| | Internal (đang có) | External (cần tạo mới) |
|---|---|---|
| Ai đăng nhập được | Chỉ user trong workspace | Bất kỳ ai có tài khoản Google |
| Dùng cho | Workflow nội bộ (n8n) | Đăng nhập khách/sale/admin |
| Chế độ Testing | — | Tối đa 100 user, **không cần** Google verify |

> Lưu ý: **không** dùng credential kiểu của n8n cho Sign-in. n8n credentials chỉ
> phục vụ node trong workflow.

---

## 2. Các bước trên Google Cloud Console

1. **Tạo / chọn project**
   - Vào <https://console.cloud.google.com/> → tạo project mới tên `ELC Sign-in`
     (hoặc dùng project có sẵn cũng được).

2. **OAuth consent screen** (Màn hình đồng ý)
   - Menu **APIs & Services → OAuth consent screen**.
   - User Type: chọn **External** → Create.
   - App name: `Eurowindow Light City`
   - User support email: `info@eurowindowlightcity.net`
   - Developer contact: email của anh.
   - **Publishing status: để ở Testing** (đủ cho tối đa 100 user).
   - Ở mục **Test users** → bấm **Add users** → thêm các Gmail sẽ dùng để test
     (vd Gmail cá nhân của anh). Chỉ user trong danh sách này login được khi còn
     ở chế độ Testing.

3. **Scopes** (Phạm vi)
   - Chỉ cần 3 scope non-sensitive: `openid`, `email`, `profile`.
   - Đây là scope cơ bản, **không cần** Google review/verification.

4. **Tạo OAuth client ID**
   - Menu **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `ELC Sign-in Client`.
   - **Authorized redirect URIs** — thêm cả 2 dòng:
     ```
     https://api.eurowindowlightcity.net/auth/google/callback
     http://localhost:8000/auth/google/callback
     ```
   - Bấm **Create** → copy lại **Client ID** và **Client Secret**.

---

## 3. Đặt biến môi trường (Railway — service RAI-ELC / agent-engine)

Vào Railway → service backend (agent-engine) → tab **Variables** → thêm 4 biến:

```
GOOGLE_OAUTH_CLIENT_ID=<Client ID vừa copy>
GOOGLE_OAUTH_CLIENT_SECRET=<Client Secret vừa copy>
GOOGLE_OAUTH_REDIRECT_URI=https://api.eurowindowlightcity.net/auth/google/callback
FRONTEND_URL=https://eurowindowlightcity.net
```

Tuỳ chọn (nếu khác mặc định):

```
ADMIN_URL=https://admin.eurowindowlightcity.net        # cổng admin
GOOGLE_WORKSPACE_DOMAIN=eurowindowlightcity.net        # domain admin
```

> 🔒 **Không** commit Client Secret vào code/Git. Chỉ đặt trong Railway Variables.

Sau khi thêm xong → bấm **Deploy** lại service.

### Biến phía frontend (đã có sẵn, kiểm tra cho chắc)

- Web (`apps/web`): `NEXT_PUBLIC_AGENT_ENGINE_URL=https://api.eurowindowlightcity.net`
- Admin (`apps/admin`): `NEXT_PUBLIC_API_URL=https://api.eurowindowlightcity.net`

---

## 4. Quy tắc phân quyền trong backend

- **role=client / sale**: bất kỳ tài khoản Google nào cũng tạo được tài khoản mới.
  Nếu sale đăng ký qua link `?ref=...` thì mã giới thiệu được gắn làm upline.
- **role=admin**: chỉ chấp nhận email thuộc domain `eurowindowlightcity.net`.
  - Email ngoài domain → bị từ chối (`error=not_workspace`).
  - Tài khoản client/sale sẵn có (dù đúng domain) **không** tự lên admin
    (`error=not_admin`) — chống leo thang quyền.
- `state` (chống CSRF) là JWT **hết hạn sau 5 phút** → chống replay.

---

## 5. Kiểm thử (test flow)

1. Mở <https://eurowindowlightcity.net/login>.
2. Bấm **"Đăng nhập với Google"** → chọn 1 Gmail **đã thêm vào Test users**
   (khác `info@eurowindowlightcity.net`).
3. Sau khi đồng ý, trình duyệt quay về `/auth/callback#token=...` rồi tự vào khu
   khách hàng `/client` (tài khoản mới) hoặc portal tương ứng.
4. Mở DevTools → Application → Cookies: thấy cookie `auth_token` + `auth_user`.
5. Test admin: mở <https://admin.eurowindowlightcity.net/login> → bấm
   **"Đăng nhập với Google (Admin)"** → đăng nhập bằng email workspace
   (`...@eurowindowlightcity.net`) → vào được dashboard admin.

### Các mã lỗi có thể gặp (hiện trên trang /auth/callback)

| Mã | Ý nghĩa |
|---|---|
| `not_workspace` | Email không thuộc domain workspace (khi login admin) |
| `not_admin` | Tài khoản tồn tại nhưng không phải admin |
| `invalid_state` | Phiên hết hạn (quá 5 phút) hoặc state bị sửa |
| `google_exchange_failed` | Lỗi kết nối Google / sai Client Secret / sai redirect URI |
| `email_unverified` | Email Google chưa xác minh |

---

## 6. Lên Production (sau giai đoạn Testing)

- Chế độ **Testing** giới hạn **100 test user**. Khi cần mở cho mọi khách:
  - Vào **OAuth consent screen** → **Publish app** → **Submit for verification**.
  - Vì chỉ xin scope `openid email profile` (non-sensitive) nên thủ tục verify
    rất nhẹ, thường duyệt nhanh.
- Sau khi Published, bỏ giới hạn 100 user và không cần thêm Test users thủ công.

---

## 7. Chạy thử local (tuỳ chọn, cho dev)

```bash
# backend
cd apps/agent-engine
export GOOGLE_OAUTH_CLIENT_ID=...           # dùng client External
export GOOGLE_OAUTH_CLIENT_SECRET=...
export GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback
export FRONTEND_URL=http://localhost:3000
uvicorn app.main:app --reload --port 8000

# web
cd apps/web && npm run dev   # http://localhost:3000/login
```

Nhớ thêm `http://localhost:8000/auth/google/callback` vào Authorized redirect
URIs của client trên Google Console (đã hướng dẫn ở bước 2.4).
