"""API module NHÂN SỰ (HR) — yêu cầu role=admin.

Phân quyền theo vai trò + mục tiêu KPI + báo cáo hiệu suất AI cho từng nhân sự.
KHÔNG đụng vào phân quyền hiện có (require_admin/require_sale) — chỉ MỞ RỘNG.

Nhân sự & vai trò:
  GET    /admin/hr/staff                       → list nhân sự (role + status + %KPI)
  POST   /admin/hr/staff                       → tạo nhân sự (gán vai trò)
  PATCH  /admin/hr/staff/{id}                  → sửa nhân sự (đổi vai trò...)
  PATCH  /admin/hr/staff/{id}/status           → bật/tắt (khoá/mở)

Ma trận quyền:
  GET    /admin/hr/permissions                 → ma trận role × permission
  PUT    /admin/hr/permissions                 → cập nhật quyền 1 vai trò
  POST   /admin/hr/permissions/reset           → khôi phục mặc định

Mục tiêu / KPI:
  GET    /admin/hr/objectives[?staff_id=]      → list objective (kèm actual + %)
  POST   /admin/hr/objectives                  → tạo objective
  PATCH  /admin/hr/objectives/{id}             → sửa objective
  DELETE /admin/hr/objectives/{id}             → xoá objective

Báo cáo hiệu suất AI:
  POST   /admin/hr/staff/{id}/performance-report → Claude sinh nhận xét/đề xuất

Tổng quan:
  GET    /admin/hr/overview                    → nhân sự theo vai trò + top + %KPI
"""

from __future__ import annotations

import secrets
import string
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import require_admin
from app.core import (
    audit_store,
    hr_objectives_store,
    hr_performance,
    hr_roles_store,
    user_store,
)
from app.core.security import hash_password
from app.schemas.hr import (
    ObjectiveCreate,
    ObjectiveOut,
    ObjectiveUpdate,
    PerformanceReport,
    PermissionMatrix,
    RolePermissionUpdate,
    StaffCreate,
    StaffStatusUpdate,
    StaffUpdate,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin/hr", tags=["admin", "hr"])

# Vai trò được coi là "nhân sự nội bộ" (loại khách hàng khỏi danh sách HR).
_STAFF_ROLES = {"admin", "manager", "sale", "marketing", "accountant", "support"}


def _gen_temp_password(length: int = 10) -> str:
    """Sinh mật khẩu tạm có cả chữ + số (thoả ràng buộc đăng nhập)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isalpha() for c in pwd) and any(c.isdigit() for c in pwd):
            return pwd


def _name_map() -> dict:
    return {u["id"]: u.get("full_name", "") for u in user_store.list_users()}


def _staff_completion_map() -> dict:
    """staff_id → % hoàn thành trung bình các mục tiêu (0 nếu chưa có)."""
    objectives = hr_objectives_store.list_objectives()
    acc: dict[str, list[float]] = {}
    for o in objectives:
        acc.setdefault(o["staff_id"], []).append(o["completion_pct"])
    return {sid: round(sum(v) / len(v), 1) for sid, v in acc.items() if v}


# ---------------------------------------------------------------------------
# Nhân sự & vai trò
# ---------------------------------------------------------------------------

@router.get("/staff")
def list_staff(
    include_clients: bool = Query(default=False),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Danh sách nhân sự (kèm vai trò + trạng thái + % hoàn thành mục tiêu).

    Mặc định loại khách hàng (role=client). include_clients=true để kèm cả KH.
    """
    completion = _staff_completion_map()
    users = user_store.list_users()
    rows = []
    for u in users:
        role = u.get("role", "sale")
        if not include_clients and role == "client":
            continue
        view = user_store.public_view(u)
        view["objective_completion_pct"] = completion.get(u["id"], 0.0)
        rows.append(view)
    rows.sort(key=lambda r: (r.get("role", ""), r.get("full_name", "")))
    return {"staff": rows, "count": len(rows)}


@router.post("/staff", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_staff(
    payload: StaffCreate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    """Tạo nhân sự mới + gán vai trò (bỏ qua luồng đăng ký công khai)."""
    password = payload.password or _gen_temp_password()
    try:
        created = user_store.create_user(
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(password),
            phone=payload.phone,
            role=payload.role,
            region=payload.region,
            upline_email=payload.upline_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    audit_store.record_admin(
        "hr.staff.create", admin, target=created["id"],
        new_value={"email": created["email"], "role": created["role"]},
        detail=f"tạo nhân sự {created['email']} ({created['role']})",
    )
    return UserOut(**user_store.public_view(created))


@router.patch("/staff/{user_id}", response_model=UserOut)
def update_staff(
    user_id: str,
    payload: StaffUpdate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    """Sửa nhân sự (đổi vai trò / thông tin). Bảo vệ admin tự hạ quyền/khoá mình."""
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Cần ít nhất một trường để cập nhật")

    if user_id == admin["id"]:
        if payload.role is not None and payload.role != "admin":
            raise HTTPException(400, "Không thể tự hạ quyền admin của chính mình")
        if payload.is_active is False:
            raise HTTPException(400, "Không thể tự khoá tài khoản của chính mình")

    before = user_store.find_by_id(user_id)
    if not before:
        raise HTTPException(status_code=404, detail="Nhân sự không tồn tại")
    try:
        updated = user_store.update_user(
            user_id,
            role=payload.role,
            is_active=payload.is_active,
            full_name=payload.full_name,
            phone=payload.phone,
            email=payload.email,
            region=payload.region,
            upline_email=payload.upline_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Nhân sự không tồn tại")
    audit_store.record_admin(
        "hr.staff.update", admin, target=user_id,
        old_value={"role": before.get("role"), "is_active": before.get("is_active")},
        new_value=changes,
        detail=f"cập nhật nhân sự {updated.get('email')}",
    )
    return UserOut(**user_store.public_view(updated))


@router.patch("/staff/{user_id}/status", response_model=UserOut)
def set_staff_status(
    user_id: str,
    payload: StaffStatusUpdate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    """Bật/tắt (khoá/mở) nhân sự."""
    if user_id == admin["id"] and not payload.is_active:
        raise HTTPException(400, "Không thể tự khoá tài khoản của chính mình")
    updated = user_store.update_user(user_id, is_active=payload.is_active)
    if not updated:
        raise HTTPException(status_code=404, detail="Nhân sự không tồn tại")
    audit_store.record_admin(
        "hr.staff.status", admin, target=user_id,
        new_value={"is_active": payload.is_active},
        detail=f"{'mở' if payload.is_active else 'khoá'} {updated.get('email')}",
    )
    return UserOut(**user_store.public_view(updated))


# ---------------------------------------------------------------------------
# Ma trận quyền
# ---------------------------------------------------------------------------

@router.get("/permissions", response_model=PermissionMatrix)
def get_permissions(_admin: dict = Depends(require_admin)) -> PermissionMatrix:
    return PermissionMatrix(**hr_roles_store.get_matrix())


@router.put("/permissions", response_model=PermissionMatrix)
def update_permissions(
    payload: RolePermissionUpdate,
    admin: dict = Depends(require_admin),
) -> PermissionMatrix:
    """Cập nhật quyền cho 1 vai trò (bật/tắt từng quyền)."""
    try:
        matrix = hr_roles_store.update_role_permissions(payload.role, payload.permissions)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    audit_store.record_admin(
        "hr.permissions.update", admin, target=payload.role,
        new_value=payload.permissions,
        detail=f"cập nhật quyền vai trò {payload.role}",
    )
    return PermissionMatrix(**matrix)


@router.post("/permissions/reset", response_model=PermissionMatrix)
def reset_permissions(admin: dict = Depends(require_admin)) -> PermissionMatrix:
    matrix = hr_roles_store.reset_to_default()
    audit_store.record_admin("hr.permissions.reset", admin)
    return PermissionMatrix(**matrix)


# ---------------------------------------------------------------------------
# Mục tiêu / KPI
# ---------------------------------------------------------------------------

@router.get("/objectives", response_model=list[ObjectiveOut])
def list_objectives(
    staff_id: Optional[str] = Query(default=None),
    _admin: dict = Depends(require_admin),
) -> list[ObjectiveOut]:
    rows = hr_objectives_store.list_objectives(staff_id=staff_id, name_map=_name_map())
    return [ObjectiveOut(**r) for r in rows]


@router.post("/objectives", response_model=ObjectiveOut, status_code=status.HTTP_201_CREATED)
def create_objective(
    payload: ObjectiveCreate,
    admin: dict = Depends(require_admin),
) -> ObjectiveOut:
    if not user_store.find_by_id(payload.staff_id):
        raise HTTPException(status_code=404, detail="Nhân sự không tồn tại")
    try:
        obj = hr_objectives_store.create_objective(
            staff_id=payload.staff_id,
            period=payload.period,
            metric=payload.metric,
            target=payload.target,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    audit_store.record_admin(
        "hr.objective.create", admin, target=obj["id"],
        new_value={"staff_id": payload.staff_id, "metric": payload.metric,
                   "target": payload.target, "period": payload.period},
    )
    return ObjectiveOut(**{**obj, "staff_name": _name_map().get(obj["staff_id"])})


@router.patch("/objectives/{obj_id}", response_model=ObjectiveOut)
def update_objective(
    obj_id: str,
    payload: ObjectiveUpdate,
    admin: dict = Depends(require_admin),
) -> ObjectiveOut:
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="Cần ít nhất một trường để cập nhật")
    # actual_override = null tường minh → xoá override (về auto).
    clear_override = "actual_override" in fields and fields["actual_override"] is None
    try:
        obj = hr_objectives_store.update_objective(
            obj_id,
            period=payload.period,
            metric=payload.metric,
            target=payload.target,
            actual_override=payload.actual_override,
            note=payload.note,
            clear_override=clear_override,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not obj:
        raise HTTPException(status_code=404, detail="Mục tiêu không tồn tại")
    audit_store.record_admin(
        "hr.objective.update", admin, target=obj_id, new_value=fields,
    )
    return ObjectiveOut(**{**obj, "staff_name": _name_map().get(obj["staff_id"])})


@router.delete("/objectives/{obj_id}")
def delete_objective(
    obj_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    ok = hr_objectives_store.delete_objective(obj_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Mục tiêu không tồn tại")
    audit_store.record_admin("hr.objective.delete", admin, target=obj_id)
    return {"ok": True, "id": obj_id}


# ---------------------------------------------------------------------------
# Báo cáo hiệu suất AI
# ---------------------------------------------------------------------------

@router.post("/staff/{user_id}/performance-report", response_model=PerformanceReport)
async def performance_report(
    user_id: str,
    admin: dict = Depends(require_admin),
) -> PerformanceReport:
    """Tổng hợp số liệu 1 nhân sự → Claude sinh nhận xét + điểm mạnh/yếu + đề xuất.

    Thiếu ANTHROPIC_API_KEY (hoặc USE_MOCK_LLM) → fallback heuristic (ai_used=false).
    """
    staff = user_store.find_by_id(user_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Nhân sự không tồn tại")
    objectives = hr_objectives_store.list_objectives(staff_id=user_id)
    report = await hr_performance.generate_report(staff, objectives)
    audit_store.record_admin(
        "hr.performance.report", admin, target=user_id,
        detail=f"đánh giá hiệu suất {staff.get('email')} "
               f"(AI={'có' if report.get('ai_used') else 'fallback'})",
    )
    return PerformanceReport(**report)


# ---------------------------------------------------------------------------
# Tổng quan HR
# ---------------------------------------------------------------------------

@router.get("/overview")
def hr_overview(_admin: dict = Depends(require_admin)) -> dict:
    """Tổng nhân sự theo vai trò + top hiệu suất + % hoàn thành mục tiêu chung."""
    users = user_store.list_users()
    staff = [u for u in users if u.get("role", "sale") in _STAFF_ROLES]

    by_role: dict[str, int] = {}
    active = 0
    for u in staff:
        r = u.get("role", "sale")
        by_role[r] = by_role.get(r, 0) + 1
        if u.get("is_active", True):
            active += 1

    completion = _staff_completion_map()
    name_map = {u["id"]: u.get("full_name", "") for u in staff}
    role_map = {u["id"]: u.get("role", "") for u in staff}

    # Top hiệu suất: nhân sự có % hoàn thành mục tiêu trung bình cao nhất.
    top = sorted(
        (
            {
                "staff_id": sid,
                "staff_name": name_map.get(sid, sid),
                "role": role_map.get(sid, ""),
                "completion_pct": pct,
            }
            for sid, pct in completion.items()
            if sid in name_map  # chỉ nhân sự nội bộ
        ),
        key=lambda x: x["completion_pct"],
        reverse=True,
    )[:5]

    # % hoàn thành mục tiêu chung (trung bình mọi objective).
    all_objs = hr_objectives_store.list_objectives()
    overall = (
        round(sum(o["completion_pct"] for o in all_objs) / len(all_objs), 1)
        if all_objs
        else 0.0
    )

    return {
        "staff_total": len(staff),
        "staff_active": active,
        "staff_by_role": by_role,
        "objectives_total": len(all_objs),
        "overall_completion_pct": overall,
        "top_performers": top,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
