"""Kết nối SMTP ép IPv4.

Lý do: container Railway thường KHÔNG có route IPv6. Khi host SMTP có bản ghi
AAAA, smtplib sẽ thử kết nối IPv6 trước → `OSError: [Errno 101] Network is
unreachable`. Module này resolve host ra IPv4 và ép mọi kết nối nội bộ của
smtplib (kể cả create_connection của SMTP_SSL) đi qua IPv4, đồng thời vẫn truyền
hostname GỐC để chứng chỉ TLS khớp.

Dùng:
    with open_smtp(host, port, use_ssl=..., use_tls=..., timeout=15) as server:
        server.login(user, password)
        server.send_message(msg)
"""
from __future__ import annotations

import socket
import ssl
import smtplib
import threading
from contextlib import contextmanager

# Khoá để tuần tự hoá việc patch socket.getaddrinfo (chỉ trong lúc connect).
_connect_lock = threading.Lock()


def resolve_ipv4(host: str, port: int) -> str:
    """Trả về 1 địa chỉ IPv4 của host (raise nếu không có)."""
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    if not infos:
        raise OSError(f"Không tìm thấy địa chỉ IPv4 cho host {host!r}")
    return infos[0][4][0]


@contextmanager
def open_smtp(
    host: str,
    port: int,
    *,
    use_ssl: bool = False,
    use_tls: bool = False,
    timeout: int = 15,
):
    """Mở kết nối SMTP qua IPv4 (đã ehlo / starttls nếu cần).

    - use_ssl=True  → SMTP_SSL (port 465).
    - use_tls=True  → SMTP + STARTTLS (port 587).
    - cả hai False  → SMTP thuần (hiếm dùng, port 25 thường bị chặn).
    """
    if not host:
        raise ValueError("SMTP host trống")

    # Resolve sớm để báo lỗi DNS rõ ràng + đảm bảo có IPv4.
    resolve_ipv4(host, port)
    context = ssl.create_default_context()

    _orig_getaddrinfo = socket.getaddrinfo

    def _ipv4_only(h, p, family=0, type=0, proto=0, flags=0):  # noqa: A002
        return _orig_getaddrinfo(h, p, socket.AF_INET, type, proto, flags)

    server = None
    # Chỉ patch getaddrinfo trong lúc thiết lập kết nối; vẫn truyền hostname gốc
    # nên SNI / chứng chỉ TLS khớp host thật.
    with _connect_lock:
        socket.getaddrinfo = _ipv4_only
        try:
            if use_ssl:
                server = smtplib.SMTP_SSL(
                    host, port, timeout=timeout, context=context
                )
                server.ehlo()
            else:
                server = smtplib.SMTP(host, port, timeout=timeout)
                server.ehlo()
                if use_tls:
                    server.starttls(context=context)
                    server.ehlo()
        finally:
            socket.getaddrinfo = _orig_getaddrinfo

    try:
        yield server
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001
            try:
                server.close()
            except Exception:  # noqa: BLE001
                pass


def classify_error(exc: Exception) -> str:
    """Chuyển exception SMTP thành thông báo tiếng Việt dễ hiểu."""
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Sai tài khoản hoặc mật khẩu SMTP (xác thực thất bại)."
    if isinstance(exc, smtplib.SMTPConnectError):
        return ("Không kết nối được tới máy chủ SMTP — kiểm tra host/port "
                "(Railway thường chặn port 25, hãy dùng 587 hoặc 465).")
    if isinstance(exc, socket.gaierror):
        return "Sai SMTP host — không phân giải được tên miền."
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return "Hết thời gian chờ kết nối — kiểm tra host/port hoặc tường lửa."
    if isinstance(exc, ConnectionRefusedError):
        return ("Cổng bị từ chối — kiểm tra port "
                "(587 cho TLS, 465 cho SSL; tránh 25).")
    if isinstance(exc, OSError):
        return (f"Lỗi mạng: {exc}. "
                "Nếu là 'Network is unreachable' thì host/port có thể sai.")
    return f"{type(exc).__name__}: {exc}"
