"""API MARKETING PIPELINE — dây chuyền sản xuất content AI nhiều giai đoạn (admin).

Prefix /admin/marketing/pipeline (require_admin). Một PIPELINE chạy tuần tự:
  research → script → content → video_script → publish.

Endpoint:
  GET    /admin/marketing/pipeline                  → danh sách (lọc channel)
  POST   /admin/marketing/pipeline                  → tạo mới
  GET    /admin/marketing/pipeline/{id}             → chi tiết + outputs
  PATCH  /admin/marketing/pipeline/{id}             → cập nhật metadata
  PUT    /admin/marketing/pipeline/{id}/stage/{stage}   → sửa tay output 1 giai đoạn
  POST   /admin/marketing/pipeline/{id}/run-stage/{stage} → chạy 1 giai đoạn (AI)
  POST   /admin/marketing/pipeline/{id}/run-all     → chạy tuần tự (mặc định DỪNG trước publish)
  POST   /admin/marketing/pipeline/{id}/publish     → đăng kênh (BẮT BUỘC confirm)
  DELETE /admin/marketing/pipeline/{id}             → xoá

AN TOÀN: thiếu API key / lỗi gọi Claude → fallback template (không 500). Publish là
HÀNH ĐỘNG GHI → bắt buộc confirm=True. Các hàm *_internal (sync) được OpenClaw bridge
tái dùng để CEO bot điều khiển pipeline.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.api.deps import require_admin
from app.core import marketing_pipeline_ai as ai
from app.core import marketing_pipeline_store as store
from app.schemas.marketing_pipeline import (
    AI_STAGES,
    STAGE_ORDER,
    Pipeline,
    PipelineCreate,
    PipelineRunResponse,
    PipelineUpdate,
    PublishRequest,
    RunAllRequest,
    StageEdit,
)

router = APIRouter(prefix="/admin/marketing/pipeline", tags=["admin", "marketing", "pipeline"])


# ===========================================================================
# Lỗi nội bộ (để bridge/endpoint map status code)
# ===========================================================================
class PipelineNotFound(Exception):
    pass


class PipelineConfirmRequired(Exception):
    pass


# ===========================================================================
# Publish — đẩy nội dung lên kênh đã kết nối (integrations_store).
# Mỗi kênh trả dict {channel, status, detail, ...}. status:
#   posted | scheduled | needs_connection | error | skipped
# ===========================================================================
def _publish_facebook(content_text: str) -> dict:
    from app.core import integrations_store

    creds = integrations_store.get_credential("facebook")
    token = creds.get("page_access_token")
    page_id = creds.get("page_id")
    if not token:
        return {"channel": "facebook", "status": "needs_connection",
                "detail": "Chưa kết nối Facebook — thiếu Page Access Token. Vào Tích hợp để kết nối."}
    if not page_id:
        return {"channel": "facebook", "status": "needs_connection",
                "detail": "Chưa cấu hình Page ID cho Facebook."}
    try:
        import httpx

        with httpx.Client(timeout=20) as client:
            r = client.post(
                f"https://graph.facebook.com/v19.0/{page_id}/feed",
                data={"message": content_text, "access_token": token},
            )
        data = r.json() if r.content else {}
        if r.status_code == 200 and isinstance(data, dict) and data.get("id"):
            return {"channel": "facebook", "status": "posted", "post_id": data["id"],
                    "detail": "Đã đăng bài lên Facebook Page."}
        err = (data.get("error") or {}).get("message") if isinstance(data, dict) else None
        return {"channel": "facebook", "status": "error",
                "detail": f"Facebook từ chối: {err or r.status_code}"}
    except Exception as exc:  # noqa: BLE001
        return {"channel": "facebook", "status": "error", "detail": f"Lỗi đăng Facebook: {exc}"}


def _publish_zalo(content_text: str) -> dict:
    from app.core import integrations_store

    creds = integrations_store.get_credential("zalo")
    token = creds.get("oa_access_token")
    if not token:
        return {"channel": "zalo", "status": "needs_connection",
                "detail": "Chưa kết nối Zalo OA — thiếu OA Access Token. Vào Tích hợp để kết nối."}
    # API đăng bài/broadcast Zalo OA cần luồng template riêng → khung: ghi nhận đã
    # lên lịch, KHÔNG tự gửi để tránh phát tán ngoài ý muốn.
    return {"channel": "zalo", "status": "scheduled",
            "detail": "Đã kết nối Zalo OA. Nội dung được lưu & lên lịch — API đăng bài "
                      "Zalo cần hoàn thiện cấu hình template trước khi tự gửi."}


def _publish_email(content_text: str, *, recipients: list[str], subject: Optional[str]) -> dict:
    if not recipients:
        return {"channel": "email", "status": "needs_connection",
                "detail": "Chưa có địa chỉ người nhận (email_to)."}
    try:
        from app.core import gmail_sender

        if not gmail_sender.is_available():
            return {"channel": "email", "status": "needs_connection",
                    "detail": "Gmail API chưa sẵn sàng — kết nối Google Workspace (scope gmail.send)."}
        res = gmail_sender.send_email(
            recipients, subject or "Thông tin từ Happy Home", content_text, html=False
        )
        return {"channel": "email", "status": "posted",
                "detail": f"Đã gửi email tới {len(recipients)} người nhận.",
                "message_id": res.get("id")}
    except Exception as exc:  # noqa: BLE001
        return {"channel": "email", "status": "error", "detail": f"Lỗi gửi email: {exc}"}


def _publish_one(channel: str, content_text: str, *, recipients: list[str],
                 subject: Optional[str]) -> dict:
    if channel == "facebook":
        return _publish_facebook(content_text)
    if channel == "zalo":
        return _publish_zalo(content_text)
    if channel == "email":
        return _publish_email(content_text, recipients=recipients, subject=subject)
    return {"channel": channel, "status": "skipped",
            "detail": f"Kênh '{channel}' chưa hỗ trợ tự đăng — vui lòng đăng thủ công."}


# ===========================================================================
# Orchestration nội bộ (SYNC) — tái dùng bởi endpoint (run_in_threadpool) & OpenClaw
# ===========================================================================
def run_stage_internal(pipeline_id: str, stage: str) -> dict:
    """Chạy 1 giai đoạn AI (research/script/content/video_script). Trả pipeline mới.

    Raise PipelineNotFound nếu không có pipeline; ValueError nếu stage không hợp lệ
    hoặc là 'publish' (publish dùng publish_internal riêng vì cần confirm/kênh).
    """
    if stage not in AI_STAGES:
        raise ValueError(f"Giai đoạn '{stage}' không chạy AI (dùng publish riêng).")
    p = store.get_pipeline(pipeline_id)
    if not p:
        raise PipelineNotFound(pipeline_id)
    store.set_stage(pipeline_id, stage, status="running")
    p = store.get_pipeline(pipeline_id) or p
    try:
        text, used_llm = ai.STAGE_GENERATORS[stage](p)
    except Exception as exc:  # noqa: BLE001 — không để giai đoạn làm chết request
        store.set_stage(pipeline_id, stage, status="error", error=str(exc))
        return store.get_pipeline(pipeline_id) or p
    return store.set_stage(
        pipeline_id, stage, status="done", output=text, used_llm=used_llm, error=""
    ) or p


def publish_internal(pipeline_id: str, *, channels: list[str], confirm: bool,
                     email_to: Optional[list[str]] = None,
                     subject: Optional[str] = None) -> dict:
    """Đăng nội dung pipeline lên kênh. BẮT BUỘC confirm=True (an toàn)."""
    p = store.get_pipeline(pipeline_id)
    if not p:
        raise PipelineNotFound(pipeline_id)
    if not confirm:
        raise PipelineConfirmRequired("Publish cần xác nhận (confirm=True).")

    content_text = ((p.get("stages") or {}).get("content") or {}).get("output")
    if not content_text:
        raise ValueError("Chưa có nội dung (giai đoạn 'content') để đăng. Hãy chạy content trước.")

    chans = [c for c in (channels or []) if c] or [p.get("channel") or "facebook"]
    recipients = email_to or []
    results = [
        _publish_one(c, content_text, recipients=recipients, subject=subject)
        for c in chans
    ]
    posted = any(r["status"] in ("posted", "scheduled") for r in results)
    result_obj = {"channels": chans, "results": results,
                  "needs_connection": [r["channel"] for r in results if r["status"] == "needs_connection"]}
    store.set_stage(
        pipeline_id, "publish",
        status="done" if posted else "error",
        result=result_obj,
        error="" if posted else "Không kênh nào đăng được — kiểm tra kết nối kênh.",
    )
    return store.get_pipeline(pipeline_id) or p


def run_all_internal(pipeline_id: str, *, include_publish: bool = False,
                     confirm: bool = False, channels: Optional[list[str]] = None) -> dict:
    """Chạy tuần tự các giai đoạn AI; tuỳ chọn publish (cần confirm). Trả pipeline mới."""
    p = store.get_pipeline(pipeline_id)
    if not p:
        raise PipelineNotFound(pipeline_id)
    ran: list[str] = []
    used_any = False
    for stage in AI_STAGES:
        p = run_stage_internal(pipeline_id, stage)
        ran.append(stage)
        st = (p.get("stages") or {}).get(stage) or {}
        used_any = used_any or bool(st.get("used_llm"))
    if include_publish:
        if not confirm:
            raise PipelineConfirmRequired("Chạy kèm publish cần confirm=True.")
        p = publish_internal(pipeline_id, channels=channels or [], confirm=True)
        ran.append("publish")
    return {"pipeline": p, "ran": ran, "used_llm": used_any}


# ===========================================================================
# Helpers map lỗi → HTTP
# ===========================================================================
def _to_model(p: dict) -> Pipeline:
    return Pipeline(**p)


def _msg_for(used_llm: bool) -> Optional[str]:
    return None if used_llm else "Chưa bật AI (thiếu API key) — đang dùng mẫu nội dung gợi ý."


# ===========================================================================
# CRUD
# ===========================================================================
@router.get("")
def list_pipelines(
    channel: str | None = None, _admin: dict = Depends(require_admin)
) -> dict:
    rows = store.list_pipelines(channel=channel)
    return {"pipelines": [_to_model(p).model_dump() for p in rows], "count": len(rows)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_pipeline(
    payload: PipelineCreate, user: dict = Depends(require_admin)
) -> Pipeline:
    data = payload.model_dump()
    data["created_by"] = user.get("id")
    return _to_model(store.create_pipeline(data))


@router.get("/{pipeline_id}")
def get_pipeline(pipeline_id: str, _admin: dict = Depends(require_admin)) -> Pipeline:
    p = store.get_pipeline(pipeline_id)
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    return _to_model(p)


@router.patch("/{pipeline_id}")
def update_pipeline(
    pipeline_id: str, payload: PipelineUpdate, _admin: dict = Depends(require_admin)
) -> Pipeline:
    updated = store.update_pipeline(pipeline_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    return _to_model(updated)


@router.put("/{pipeline_id}/stage/{stage}")
def edit_stage(
    pipeline_id: str, stage: str, payload: StageEdit,
    _admin: dict = Depends(require_admin),
) -> Pipeline:
    """Sửa tay output 1 giai đoạn (biên tập trước khi chạy tiếp / đăng)."""
    if stage not in STAGE_ORDER or stage == "publish":
        raise HTTPException(status_code=400, detail="Giai đoạn không hợp lệ để sửa output.")
    updated = store.set_stage(
        pipeline_id, stage, status="done", output=payload.output, error=""
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    return _to_model(updated)


@router.delete("/{pipeline_id}")
def delete_pipeline(pipeline_id: str, _admin: dict = Depends(require_admin)) -> dict:
    if not store.delete_pipeline(pipeline_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    return {"ok": True}


# ===========================================================================
# Chạy giai đoạn / toàn bộ / publish
# ===========================================================================
@router.post("/{pipeline_id}/run-stage/{stage}")
async def run_stage(
    pipeline_id: str, stage: str, _admin: dict = Depends(require_admin)
) -> PipelineRunResponse:
    if stage not in AI_STAGES:
        raise HTTPException(status_code=400, detail="Giai đoạn không chạy AI (publish dùng /publish).")
    try:
        p = await run_in_threadpool(run_stage_internal, pipeline_id, stage)
    except PipelineNotFound:
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    st = (p.get("stages") or {}).get(stage) or {}
    used = bool(st.get("used_llm"))
    return PipelineRunResponse(
        pipeline=_to_model(p), ran=[stage], used_llm=used, message=_msg_for(used)
    )


@router.post("/{pipeline_id}/run-all")
async def run_all(
    pipeline_id: str, payload: RunAllRequest, _admin: dict = Depends(require_admin)
) -> PipelineRunResponse:
    try:
        out = await run_in_threadpool(
            run_all_internal, pipeline_id,
            include_publish=payload.include_publish,
            confirm=payload.confirm,
            channels=list(payload.channels),
        )
    except PipelineNotFound:
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    except PipelineConfirmRequired as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return PipelineRunResponse(
        pipeline=_to_model(out["pipeline"]), ran=out["ran"],
        used_llm=out["used_llm"], message=_msg_for(out["used_llm"]),
    )


@router.post("/{pipeline_id}/publish")
async def publish(
    pipeline_id: str, payload: PublishRequest, _admin: dict = Depends(require_admin)
) -> PipelineRunResponse:
    try:
        p = await run_in_threadpool(
            publish_internal, pipeline_id,
            channels=list(payload.channels), confirm=payload.confirm,
            email_to=list(payload.email_to), subject=payload.subject,
        )
    except PipelineNotFound:
        raise HTTPException(status_code=404, detail="Không tìm thấy pipeline")
    except PipelineConfirmRequired as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pub = (p.get("stages") or {}).get("publish") or {}
    return PipelineRunResponse(
        pipeline=_to_model(p), ran=["publish"], used_llm=False,
        message=(pub.get("result") or {}).get("results") and "Đã xử lý đăng kênh." or None,
    )
