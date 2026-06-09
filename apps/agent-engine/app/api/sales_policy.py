"""Admin CRUD Chính sách bán hàng (/admin/sales-policy).

Pattern giống admin_commission: GET (đọc) + PUT (validate→version→backup→ghi) +
reset về mặc định. Mọi thay đổi ghi audit (prefix admin.*). Chỉ admin.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, require_admin
from app.core import audit_store, sales_policy_store
from app.schemas.sales_policy import SalesPolicyConfig, default_config

router = APIRouter(prefix="/admin/sales-policy", tags=["sales-policy"])


@router.get("", response_model=SalesPolicyConfig)
def get_policy(_admin: dict = Depends(require_admin)) -> SalesPolicyConfig:
    return sales_policy_store.get_current()


@router.put("", response_model=SalesPolicyConfig)
def update_policy(
    config: SalesPolicyConfig,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> SalesPolicyConfig:
    try:
        saved = sales_policy_store.update(config, by_admin_id=user.get("id"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    audit_store.record_admin(
        "sales_policy.update", _admin, new_value={"version": saved.version}
    )
    return saved


@router.post("/reset", response_model=SalesPolicyConfig)
def reset_policy(
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> SalesPolicyConfig:
    saved = sales_policy_store.update(default_config(), by_admin_id=user.get("id"))
    audit_store.record_admin("sales_policy.reset", _admin, new_value={"version": saved.version})
    return saved


@router.get("/history")
def policy_history(_admin: dict = Depends(require_admin)) -> dict:
    return {"versions": sales_policy_store.get_history(limit=20)}
