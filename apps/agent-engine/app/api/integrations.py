"""TRUNG TÂM TÍCH HỢP & KẾT NỐI — router admin (/admin/integrations).

Cho phép admin quản lý credential MỌI kênh & dịch vụ (Chatwoot, Stringee, SMTP,
Facebook, Zalo, n8n, Anthropic…) ngay trên UI → có hiệu lực NGAY (store-first-
then-env) mà KHÔNG cần set lại env Railway.

Endpoints (chỉ admin):
  GET    /admin/integrations            — danh sách dịch vụ + trạng thái + giá trị
                                           ĐÃ CHE (không trả full secret).
  GET    /admin/integrations/{service}  — chi tiết 1 dịch vụ (đã che).
  PUT    /admin/integrations/{service}  — lưu credential mới (full) vào store.
  POST   /admin/integrations/{service}/test — gọi thử kết nối, trả ok + chi tiết.
  DELETE /admin/integrations/{service}  — xoá credential khỏi store (về env nếu có).

AN TOÀN: GET/PUT/DELETE đều trả public_view (secret đã che). KHÔNG log secret.
Mọi thay đổi ghi audit (prefix admin.integration.*) — chỉ ghi tên dịch vụ.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import require_admin
from app.core import audit_store, integrations_store

router = APIRouter(prefix="/admin/integrations", tags=["integrations"])


@router.get("")
def list_integrations(_admin: dict = Depends(require_admin)) -> dict:
    """Toàn bộ dịch vụ + nhóm, secret đã che (không lộ full ra FE)."""
    return integrations_store.list_public()


@router.get("/{service}")
def get_integration(service: str, _admin: dict = Depends(require_admin)) -> dict:
    if integrations_store.get_service_def(service) is None:
        raise HTTPException(404, f"Dịch vụ không tồn tại: {service}")
    return integrations_store.public_view(service)


@router.put("/{service}")
def update_integration(
    service: str,
    values: Dict[str, Any] = Body(..., embed=False),
    admin: dict = Depends(require_admin),
) -> dict:
    """Lưu credential (full) vào store. Trả public_view (đã che secret)."""
    if integrations_store.get_service_def(service) is None:
        raise HTTPException(404, f"Dịch vụ không tồn tại: {service}")
    if not isinstance(values, dict):
        raise HTTPException(400, "Payload phải là object {field: value}.")
    try:
        view = integrations_store.save_credential(
            service, values, by=admin.get("id")
        )
    except integrations_store.IntegrationError as e:
        raise HTTPException(400, str(e))
    # Audit: CHỈ tên dịch vụ + danh sách field được đặt (KHÔNG giá trị).
    audit_store.record_admin(
        "integration.update",
        admin,
        target=service,
        new_value={"fields": sorted(values.keys())},
    )
    return view


@router.post("/{service}/test")
async def test_integration(service: str, _admin: dict = Depends(require_admin)) -> dict:
    if integrations_store.get_service_def(service) is None:
        raise HTTPException(404, f"Dịch vụ không tồn tại: {service}")
    result = await integrations_store.test_service(service)
    return {"service": service, **result}


@router.delete("/{service}")
def delete_integration(service: str, admin: dict = Depends(require_admin)) -> dict:
    if integrations_store.get_service_def(service) is None:
        raise HTTPException(404, f"Dịch vụ không tồn tại: {service}")
    try:
        view = integrations_store.delete_credential(service)
    except integrations_store.IntegrationError as e:
        raise HTTPException(400, str(e))
    audit_store.record_admin("integration.delete", admin, target=service)
    return view
