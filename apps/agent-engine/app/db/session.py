"""Engine + Session SQLAlchemy với *graceful degradation*.

Triết lý: Postgres là tuỳ chọn ở release này. Nếu `DATABASE_URL` trống hoặc
Postgres không kết nối được, mọi hàm ở đây trở thành no-op an toàn và ứng dụng
tiếp tục chạy trên JSON (xem `user_store`). Không bao giờ làm crash app vì DB.

Trạng thái sức khoẻ (`_HEALTHY`) được set 1 lần lúc startup qua `init_db()`:
- True  → lớp dual-write sẽ mirror sang Postgres.
- False → lớp dual-write bỏ qua, tránh hammer 1 DB đang chết.
"""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from typing import Iterator, Optional

from app.core.settings import settings

# Import lười (chỉ khi thực sự có DATABASE_URL) để app vẫn import được kể cả
# khi chưa cài sqlalchemy ở môi trường tối giản.
try:  # pragma: no cover - phụ thuộc môi trường
    from sqlalchemy import create_engine
    from sqlalchemy.engine import Engine
    from sqlalchemy.orm import Session, sessionmaker

    _SA_AVAILABLE = True
except Exception:  # noqa: BLE001
    _SA_AVAILABLE = False
    Engine = object  # type: ignore
    Session = object  # type: ignore

_LOCK = threading.Lock()
_ENGINE: Optional["Engine"] = None
_SESSION_FACTORY = None
_HEALTHY = False


def _raw_url() -> str:
    """Đọc DATABASE_URL từ env hoặc settings (env ưu tiên)."""
    return (os.getenv("DATABASE_URL") or settings.database_url or "").strip()


def _normalize_url(url: str) -> str:
    """Railway/Heroku cấp scheme `postgres://`; SQLAlchemy 2.x cần `postgresql://`.

    Đồng thời ép driver psycopg2 cho rõ ràng.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def db_configured() -> bool:
    """Có cấu hình DATABASE_URL và sqlalchemy khả dụng hay không."""
    return _SA_AVAILABLE and bool(_raw_url())


def is_healthy() -> bool:
    """Postgres đã kết nối thành công lúc startup chưa."""
    return _HEALTHY


def mark_unhealthy() -> None:
    global _HEALTHY
    _HEALTHY = False


def get_engine() -> Optional["Engine"]:
    """Tạo (lazy, 1 lần) engine. Trả None nếu không cấu hình DB."""
    global _ENGINE, _SESSION_FACTORY
    if not db_configured():
        return None
    if _ENGINE is not None:
        return _ENGINE
    with _LOCK:
        if _ENGINE is not None:
            return _ENGINE
        url = _normalize_url(_raw_url())
        connect_args = {}
        engine_kwargs = {"pool_pre_ping": True, "future": True}
        if url.startswith("sqlite"):
            # Chỉ phục vụ test offline lớp dual-write.
            connect_args = {"check_same_thread": False}
        else:
            engine_kwargs.update(pool_size=5, max_overflow=5, pool_recycle=1800)
        _ENGINE = create_engine(url, connect_args=connect_args, **engine_kwargs)
        _SESSION_FACTORY = sessionmaker(
            bind=_ENGINE, autoflush=False, expire_on_commit=False, future=True
        )
        return _ENGINE


def init_db() -> bool:
    """Khởi tạo schema lúc startup. Trả True nếu Postgres sẵn sàng.

    - Tạo bảng (create_all) — idempotent, không phá dữ liệu sẵn có. Đây là
      đường bootstrap an toàn cho v1; alembic dùng cho thay đổi schema về sau.
    - Set cờ _HEALTHY để lớp dual-write biết có nên mirror không.
    - Mọi lỗi → trả False (app tiếp tục chạy trên JSON).
    """
    global _HEALTHY
    if not db_configured():
        return False
    try:
        engine = get_engine()
        if engine is None:
            return False
        # Import ở đây để tránh import vòng và để env tối giản vẫn load được module.
        from app.db.base import Base
        from app.db import models  # noqa: F401 — đăng ký bảng vào metadata

        with engine.connect() as conn:  # kiểm tra kết nối thật
            conn.exec_driver_sql("SELECT 1")
        Base.metadata.create_all(bind=engine)
        _HEALTHY = True
        return True
    except Exception:  # noqa: BLE001 — không để DB làm chết app
        _HEALTHY = False
        return False


def session_factory():
    if _SESSION_FACTORY is None:
        get_engine()
    return _SESSION_FACTORY


@contextmanager
def db_session() -> Iterator[Optional["Session"]]:
    """Context manager an toàn. Yield None nếu DB không sẵn sàng.

        with db_session() as s:
            if s is None:
                return
            ...
    """
    factory = session_factory()
    if factory is None:
        yield None
        return
    s = factory()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def get_db() -> Iterator["Session"]:
    """FastAPI dependency (dùng từ Phase 2 khi chuyển read sang Postgres)."""
    factory = session_factory()
    if factory is None:
        raise RuntimeError("Database chưa được cấu hình (DATABASE_URL trống)")
    s = factory()
    try:
        yield s
    finally:
        s.close()
