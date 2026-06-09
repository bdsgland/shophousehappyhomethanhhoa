#!/usr/bin/env python3
"""Lấy GOOGLE_WORKSPACE_REFRESH_TOKEN cho Agent Proptech (chạy LOCAL).

Mục đích
========
Tạo (mint) 1 *refresh token* của tài khoản Google Workspace với ĐỦ scope để:
  - Tạo Google Meet qua Calendar API  → scope `calendar.events`
  - Đồng bộ tài liệu RAG từ Google Drive → scope `drive.readonly`

Token in ra màn hình. Bạn copy và dán vào Railway → service RAI-ELC →
Variables → `GOOGLE_WORKSPACE_REFRESH_TOKEN`. KHÔNG commit token vào code.

Script chỉ dùng thư viện chuẩn của Python (không cần pip install gì thêm).

────────────────────────────────────────────────────────────────────────────
CHUẨN BỊ (làm 1 lần trong Google Cloud Console)
────────────────────────────────────────────────────────────────────────────
1. Dùng OAuth Client ID kiểu "Web application" (chính là client đang dùng cho
   đăng nhập Google — GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).
2. Vào OAuth client đó → mục "Authorized redirect URIs" → THÊM:
       http://localhost:8765/
   (đổi port nếu bạn chạy script với --port khác, nhớ thêm đúng URI tương ứng).
3. Bật 2 API trong project: "Google Calendar API" và "Google Drive API".

────────────────────────────────────────────────────────────────────────────
CÁCH CHẠY
────────────────────────────────────────────────────────────────────────────
Cách 1 — đọc client id/secret từ biến môi trường:
    export GOOGLE_OAUTH_CLIENT_ID="xxx.apps.googleusercontent.com"
    export GOOGLE_OAUTH_CLIENT_SECRET="yyy"
    python3 scripts/get_google_refresh_token.py

Cách 2 — truyền trực tiếp qua tham số:
    python3 scripts/get_google_refresh_token.py \
        --client-id "xxx.apps.googleusercontent.com" \
        --client-secret "yyy"

Tuỳ chọn:
    --port 8765        Đổi cổng máy chủ local nhận callback (mặc định 8765).
    --no-browser       Không tự mở trình duyệt; tự copy URL hiện ra để mở.

Sau khi chạy: trình duyệt mở → đăng nhập đúng tài khoản Workspace muốn cấp
quyền (vd info@eurowindowlightcity.net) → bấm "Cho phép". Quay lại terminal sẽ
thấy refresh token được in ra.

⚠️ Lưu ý: Google chỉ trả refresh_token khi có `access_type=offline` +
`prompt=consent` (script đã set sẵn). Nếu trước đó đã cấp quyền, script vẫn ép
hiện màn hình đồng ý để chắc chắn nhận được refresh_token mới.
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import socket
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
from typing import Optional

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

# Phải khớp với check credential trong app: Calendar (Meet) + Drive (RAG sync).
SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.readonly",
]


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    """Bắt 1 request callback của Google rồi lấy ?code=... ."""

    server_version = "AgentProptechOAuth/1.0"
    auth_code: Optional[str] = None
    auth_error: Optional[str] = None

    def do_GET(self) -> None:  # noqa: N802 (tên do BaseHTTPRequestHandler quy định)
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "error" in params:
            _CallbackHandler.auth_error = params["error"][0]
            self._reply("Đăng nhập bị từ chối hoặc lỗi. Có thể đóng tab này.")
        elif "code" in params:
            _CallbackHandler.auth_code = params["code"][0]
            self._reply("Đã nhận mã uỷ quyền. Quay lại terminal để xem token. "
                        "Có thể đóng tab này.")
        else:
            # Bỏ qua các request phụ (vd favicon) để không làm hỏng luồng.
            self._reply("OK")

    def _reply(self, message: str) -> None:
        body = (
            "<html><head><meta charset='utf-8'><title>Agent Proptech</title></head>"
            f"<body style='font-family:sans-serif;padding:40px'>{message}</body></html>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:  # tắt log mặc định của http.server
        pass


def _build_auth_url(client_id: str, redirect_uri: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",   # bắt buộc để nhận refresh_token
        "prompt": "consent",        # ép hiện màn hình đồng ý → luôn có refresh_token
        "include_granted_scopes": "true",
    }
    return f"{AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"


def _exchange_code(
    *, code: str, client_id: str, client_secret: str, redirect_uri: str
) -> dict:
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_ENDPOINT,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
        detail = e.read().decode("utf-8", "replace")
        raise SystemExit(f"❌ Token endpoint lỗi {e.code}: {detail}")


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _mask(secret: str) -> str:
    """Che bớt chuỗi nhạy cảm: giữ đầu/cuối, thay giữa bằng '…' (để đối chiếu)."""
    if not secret:
        return "(rỗng)"
    if len(secret) <= 12:
        return secret[:2] + "…" + secret[-2:]
    return f"{secret[:8]}…{secret[-12:]} (len={len(secret)})"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mint Google Workspace refresh token (Calendar + Drive).",
    )
    parser.add_argument(
        "--client-id",
        default=os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""),
        help="OAuth Client ID (mặc định đọc env GOOGLE_OAUTH_CLIENT_ID).",
    )
    parser.add_argument(
        "--client-secret",
        default=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        help="OAuth Client Secret (mặc định đọc env GOOGLE_OAUTH_CLIENT_SECRET).",
    )
    parser.add_argument("--port", type=int, default=8765,
                        help="Cổng local nhận callback (mặc định 8765).")
    parser.add_argument("--no-browser", action="store_true",
                        help="Không tự mở trình duyệt.")
    args = parser.parse_args()

    # .strip(): chống dư khoảng trắng / ký tự xuống dòng khi export env hoặc copy
    # (nguyên nhân phổ biến gây "invalid_client — OAuth client was not found").
    args.client_id = (args.client_id or "").strip()
    args.client_secret = (args.client_secret or "").strip()

    if not args.client_id or not args.client_secret:
        raise SystemExit(
            "❌ Thiếu Client ID/Secret (đang RỖNG sau khi đọc env/args).\n"
            "   client_id  = " + _mask(args.client_id) + "\n"
            "   client_secret = " + _mask(args.client_secret) + "\n"
            "   → Đặt env GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET "
            "(nhớ `export`), hoặc dùng --client-id/--client-secret."
        )

    # In client_id (che bớt) để user tự đối chiếu với Google Cloud Console.
    print("\n🔑 Client ID đang dùng:", _mask(args.client_id))
    print("   (đọc từ env GOOGLE_OAUTH_CLIENT_ID hoặc tham số --client-id)")
    if not args.client_id.endswith(".apps.googleusercontent.com"):
        print(
            "⚠️  CẢNH BÁO: client_id KHÔNG kết thúc bằng "
            "'.apps.googleusercontent.com' — gần như chắc chắn sai giá trị "
            "→ Google sẽ báo invalid_client. Hãy kiểm tra lại."
        )

    if not _port_is_free(args.port):
        raise SystemExit(
            f"❌ Cổng {args.port} đang bận. Chạy lại với --port <cổng khác> và "
            f"nhớ thêm http://localhost:<cổng>/ vào Authorized redirect URIs."
        )

    redirect_uri = f"http://localhost:{args.port}/"
    auth_url = _build_auth_url(args.client_id, redirect_uri)

    httpd = http.server.HTTPServer(("127.0.0.1", args.port), _CallbackHandler)
    server_thread = threading.Thread(target=httpd.handle_request, daemon=True)
    server_thread.start()

    print("\n────────────────────────────────────────────────────────────")
    print("Mở URL sau trong trình duyệt và đăng nhập tài khoản Workspace:")
    print(f"\n{auth_url}\n")
    print("Redirect URI dùng:", redirect_uri)
    print("(Đảm bảo URI này đã được thêm vào OAuth client trên Google Console.)")
    print("────────────────────────────────────────────────────────────\n")

    if not args.no_browser:
        try:
            webbrowser.open(auth_url)
        except Exception:  # noqa: BLE001 — không mở được thì user tự copy URL
            pass

    print("⏳ Đang chờ bạn đồng ý trên trình duyệt…")
    server_thread.join(timeout=300)  # tối đa 5 phút
    httpd.server_close()

    if _CallbackHandler.auth_error:
        raise SystemExit(f"❌ Google trả lỗi: {_CallbackHandler.auth_error}")
    if not _CallbackHandler.auth_code:
        raise SystemExit("❌ Hết thời gian chờ / chưa nhận được mã uỷ quyền.")

    tokens = _exchange_code(
        code=_CallbackHandler.auth_code,
        client_id=args.client_id,
        client_secret=args.client_secret,
        redirect_uri=redirect_uri,
    )

    refresh_token = tokens.get("refresh_token")
    granted_scope = tokens.get("scope", "")

    if not refresh_token:
        raise SystemExit(
            "❌ Không nhận được refresh_token. Thường do tài khoản đã cấp quyền "
            "trước đó. Vào https://myaccount.google.com/permissions gỡ quyền của "
            "app rồi chạy lại script."
        )

    print("\n✅ THÀNH CÔNG! Copy dòng dưới vào Railway (RAI-ELC → Variables):\n")
    print(f"GOOGLE_WORKSPACE_REFRESH_TOKEN={refresh_token}\n")
    print("Scope đã được cấp:", granted_scope)

    missing = [s for s in SCOPES if s not in granted_scope.split()]
    if missing:
        print("\n⚠️ CẢNH BÁO: token thiếu scope:", ", ".join(missing))
        print("   Drive/Calendar có thể trả 403. Hãy gỡ quyền app rồi chạy lại.")
    else:
        print("\n✔ Token có đủ cả calendar.events và drive.readonly.")


if __name__ == "__main__":
    sys.exit(main())
