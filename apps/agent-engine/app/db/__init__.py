"""Lớp persistence Postgres (Sprint 1.1).

Toàn bộ lớp này là *tuỳ chọn lúc runtime*: nếu không có `DATABASE_URL`
(hoặc Postgres không kết nối được) thì ứng dụng vẫn chạy bình thường trên
file JSON (graceful degradation). Xem `app/db/session.py`.
"""
