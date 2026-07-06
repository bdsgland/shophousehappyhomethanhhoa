"""Schemas cho MARKETING PIPELINE — dây chuyền sản xuất content AI nhiều giai đoạn.

Một PIPELINE = chuỗi GIAI ĐOẠN tuần tự cho 1 chủ đề/dự án bất động sản Happy Home:
  research → script → content → video_script → publish.

Tái dùng kiểu kênh/định dạng/tone với schemas/marketing.py. Field optional cho
update; validate nhẹ ở store/endpoint (không raise 500). Convention *Create/*Update
/*Out giống app/schemas/marketing.py.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.marketing import CampaignChannel

# Giai đoạn của dây chuyền (đúng thứ tự chạy).
PipelineStage = Literal["research", "script", "content", "video_script", "publish"]
STAGE_ORDER: tuple[str, ...] = ("research", "script", "content", "video_script", "publish")
# Giai đoạn sinh nội dung bằng AI (publish KHÔNG gọi AI — chỉ đẩy kênh).
AI_STAGES: tuple[str, ...] = ("research", "script", "content", "video_script")

# Định dạng bài viết (đa định dạng theo yêu cầu nghiệp vụ).
ContentFormat = Literal["toplist", "pov", "case_study", "howto", "generic"]
# Ngôn ngữ đầu ra: tiếng Việt, tiếng Anh, hoặc song ngữ Việt-Anh.
PipelineLanguage = Literal["vi", "en", "bilingual"]

StageStatus = Literal["pending", "running", "done", "error"]


# ---------------------------------------------------------------------------
# Trạng thái 1 giai đoạn
# ---------------------------------------------------------------------------

class StageState(BaseModel):
    """Trạng thái + output của 1 giai đoạn."""

    status: StageStatus = "pending"
    output: Optional[str] = None  # research/script/content/video_script: text
    # publish lưu chi tiết dạng dict (kênh, kết quả từng kênh) ở `result`.
    result: Optional[dict[str, Any]] = None
    used_llm: bool = False
    updated_at: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Pipeline CRUD
# ---------------------------------------------------------------------------

class PipelineCreate(BaseModel):
    """Tạo pipeline mới — nhập chủ đề/dự án/định dạng/tone/ngôn ngữ."""

    name: str = Field(min_length=2, max_length=160)
    topic: str = Field(min_length=2, max_length=600)  # chủ đề / từ khoá chính
    project: Optional[str] = Field(default=None, max_length=200)  # dự án Happy Home
    audience: Optional[str] = Field(default=None, max_length=400)
    content_format: ContentFormat = "generic"
    channel: CampaignChannel = "facebook"
    tone: Optional[str] = Field(default=None, max_length=80)
    language: PipelineLanguage = "vi"
    campaign_id: Optional[str] = Field(default=None, max_length=80)


class PipelineUpdate(BaseModel):
    """Cập nhật metadata pipeline (tất cả tuỳ chọn)."""

    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    topic: Optional[str] = Field(default=None, min_length=2, max_length=600)
    project: Optional[str] = Field(default=None, max_length=200)
    audience: Optional[str] = Field(default=None, max_length=400)
    content_format: Optional[ContentFormat] = None
    channel: Optional[CampaignChannel] = None
    tone: Optional[str] = Field(default=None, max_length=80)
    language: Optional[PipelineLanguage] = None
    campaign_id: Optional[str] = Field(default=None, max_length=80)


class StageEdit(BaseModel):
    """Sửa tay output 1 giai đoạn (cho phép biên tập trước khi chạy tiếp/đăng)."""

    output: str = Field(max_length=20000)


class Pipeline(BaseModel):
    """Bản ghi pipeline trả về FE."""

    id: str
    name: str
    topic: str
    project: Optional[str] = None
    audience: Optional[str] = None
    content_format: ContentFormat = "generic"
    channel: CampaignChannel = "facebook"
    tone: Optional[str] = None
    language: PipelineLanguage = "vi"
    campaign_id: Optional[str] = None
    stages: dict[str, StageState] = Field(default_factory=dict)
    created_by: Optional[str] = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Chạy giai đoạn / publish
# ---------------------------------------------------------------------------

class RunAllRequest(BaseModel):
    """Chạy toàn bộ dây chuyền. Mặc định DỪNG TRƯỚC publish (an toàn).

    Muốn đăng luôn: include_publish=True + confirm=True + chọn channels.
    """

    include_publish: bool = False
    confirm: bool = False
    channels: list[CampaignChannel] = Field(default_factory=list)


class PublishRequest(BaseModel):
    """Đăng/đẩy nội dung pipeline lên kênh. BẮT BUỘC confirm=True (an toàn)."""

    channels: list[CampaignChannel] = Field(default_factory=list)
    confirm: bool = False
    # Email: danh sách người nhận (khi channel=email).
    email_to: list[str] = Field(default_factory=list)
    subject: Optional[str] = Field(default=None, max_length=200)


class PipelineRunResponse(BaseModel):
    """Kết quả 1 lần chạy giai đoạn/toàn bộ — kèm pipeline mới nhất."""

    pipeline: Pipeline
    ran: list[str] = Field(default_factory=list)  # các giai đoạn vừa chạy
    used_llm: bool = False
    message: Optional[str] = None
