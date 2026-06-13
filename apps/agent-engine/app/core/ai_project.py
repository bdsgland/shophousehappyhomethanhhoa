"""AI hỗ trợ biên tập nội dung dự án ("Sửa bằng AI") bằng Claude THẬT.

Tái dùng đúng pattern app/core/ai_marketing.py:
  • Claude client: anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key).
  • Model qua settings.project_ai_model (trống → fallback llm_model).
  • Bật LLM khi có API key & KHÔNG ở chế độ mock; thiếu/lỗi → FALLBACK (giữ
    nguyên nội dung + ghi note), KHÔNG raise (không để 500).
  • Giới hạn max_tokens (settings.project_ai_max_tokens) để chặn chi phí.

KHÔNG tự lưu — chỉ TRẢ ĐỀ XUẤT để admin xem trước rồi PUT/PATCH.

Hàm public:
  ai_edit_section(section, instruction, current) -> (suggestion|None, suggestion_text|None, used_llm, note)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from app.core.settings import settings
from app.schemas.project import SECTION_MODELS

log = logging.getLogger(__name__)

# Nhãn tiếng Việt mô tả từng section cho prompt (giúp AI bám ngữ cảnh).
_SECTION_LABEL = {
    "overview": "Tổng quan dự án (carousel ảnh + bảng thông số)",
    "location": "Vị trí (mô tả + danh sách kết nối + toạ độ bản đồ)",
    "training": "Tài liệu đào tạo cho sale",
    "subzones": "Các phân khu (tên, phong cách, mô tả, ảnh)",
    "gallery360": "Trải nghiệm ảnh 360° các phân khu",
    "policy": "Chính sách bán hàng (các đợt + bảng giá tham khảo + ghi chú hoa hồng)",
    "timeline": "Tiến độ dự án (các mốc thời gian)",
    "news": "Tin tức dự án",
}


def _model() -> str:
    return settings.project_ai_model or settings.llm_model


def _llm_enabled() -> bool:
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


def _parse_json(text: Optional[str]) -> Optional[dict]:
    """Parse JSON object từ output Claude (chịu được code-fence / text thừa)."""
    if not text:
        return None
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*", "", candidate).strip().rstrip("`").strip()
    try:
        obj = json.loads(candidate)
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, ValueError):
        pass
    m = re.search(r"\{.*\}", candidate, re.DOTALL)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


async def _call_claude(system: str, user: str) -> Optional[str]:
    """Gọi Claude trả text. KHÔNG raise — mọi lỗi → None để caller fallback."""
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=_model(),
            max_tokens=settings.project_ai_max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text if resp.content else ""
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("AI Project gọi Claude lỗi (%s): %s", _model(), e)
        return None


async def ai_edit_section(
    section: str, instruction: str, current: dict
) -> tuple[Optional[dict], Optional[str], bool, Optional[str]]:
    """Đề xuất nội dung MỚI cho 1 section dựa trên yêu cầu của admin.

    Trả về (suggestion, suggestion_text, used_llm, note):
      - suggestion: dict đã validate đúng shape section (admin PUT/PATCH thẳng).
      - suggestion_text: văn bản thô khi AI trả JSON sai shape (admin copy tay).
      - used_llm: False khi chưa cấu hình key / lỗi → giữ nguyên nội dung.
      - note: ghi chú trạng thái cho admin.
    """
    model = SECTION_MODELS.get(section)
    if model is None:
        return None, None, False, f"Section không hợp lệ: {section}"

    if not _llm_enabled():
        return (
            None,
            None,
            False,
            "Chưa cấu hình ANTHROPIC_API_KEY (hoặc đang ở chế độ mock) — "
            "AI chưa hoạt động. Vui lòng chỉnh tay rồi lưu.",
        )

    label = _SECTION_LABEL.get(section, section)
    current_json = json.dumps(current, ensure_ascii=False, indent=2)

    system = (
        "Bạn là biên tập viên nội dung bất động sản người Việt cho trang giới thiệu "
        "dự án. Bạn nhận một object JSON là nội dung hiện tại của một mục (section) "
        "và một yêu cầu chỉnh sửa. Hãy trả về JSON MỚI ĐÚNG NGUYÊN cấu trúc/khoá như "
        "JSON đầu vào (giữ đúng tên trường, kiểu dữ liệu, độ dài mảng hợp lý), chỉ "
        "thay đổi phần văn bản theo yêu cầu. TUYỆT ĐỐI KHÔNG bịa số liệu pháp lý/giá; "
        "giữ nguyên đường dẫn ảnh (src/img) và URL. CHỈ trả về JSON, KHÔNG giải thích."
    )
    user = (
        f"Mục cần chỉnh: {label} (section key: {section}).\n"
        f"Yêu cầu của admin: {instruction}\n\n"
        f"JSON nội dung hiện tại:\n{current_json}\n\n"
        "Trả về JSON mới cùng cấu trúc."
    )

    text = await _call_claude(system, user)
    if text is None:
        return None, None, False, "Gọi AI thất bại — vui lòng thử lại hoặc chỉnh tay."

    obj = _parse_json(text)
    if obj is None:
        return None, text.strip(), True, "AI trả về văn bản (không phải JSON đúng cấu trúc) — xem bản nháp bên dưới."

    try:
        validated = model.model_validate(obj)
        # by_alias=True để PriceRow xuất key 'from' khớp web/store.
        return validated.model_dump(mode="json", by_alias=True), None, True, "AI đã đề xuất nội dung — kiểm tra rồi lưu."
    except Exception:  # noqa: BLE001 — JSON đúng nghĩa nhưng lệch shape → trả thô
        return None, json.dumps(obj, ensure_ascii=False, indent=2), True, (
            "AI trả JSON nhưng chưa khớp cấu trúc mục — xem bản nháp, chỉnh lại trước khi lưu."
        )
