"""Declarative Base dùng chung cho mọi ORM model + alembic autogenerate.

Tách riêng khỏi `session.py` để alembic `env.py` import được `Base.metadata`
mà không kéo theo việc tạo engine (tránh đòi DATABASE_URL khi chạy migration
offline / autogenerate).
"""

from __future__ import annotations

from sqlalchemy.orm import declarative_base

Base = declarative_base()
