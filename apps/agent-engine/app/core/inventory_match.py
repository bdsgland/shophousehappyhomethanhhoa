"""Gợi ý BĐS (inventory matching) — khớp quỹ căn với NHU CẦU khách.

Bịt placeholder "BĐS phù hợp" ở Customer 360 + cấp "căn đề xuất" cho bộ não AI
(Đội Sale AI). Hàm THUẦN, READ-ONLY: chỉ đọc quỹ căn (qua app.api.inventory.get_units
— đã tự fallback mock khi store trống) rồi tính % phù hợp theo 3 tín hiệu:

  • Loại sản phẩm (product_type khách ↔ loai căn)           — trọng số lớn
  • Ngân sách (budget khách ↔ giá căn, có dải dung sai)      — trọng số lớn
  • Khu vực (region/dự án khách ↔ phân khu căn)              — trọng số nhỏ

An toàn tuyệt đối: thiếu dữ liệu / lỗi đọc inventory → trả [] (KHÔNG raise), bộ
não AI + hồ sơ 360 vẫn chạy bình thường. Căn "Đã bán" bị loại khỏi đề xuất.

Trả mỗi căn kèm:
  match_percent (0-100), reasons [str...], + các field hiển thị (id/lo/phan_khu/
  loai/dien_tich/gia/gia_tri/trang_thai/huong/view/position).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("inventory_match")

# Đơn vị tiền (VND).
_TY = 1_000_000_000
_TRIEU = 1_000_000

# Map nhãn loại căn (tiếng Việt, từ inventory) → khoá phân khúc chuẩn hoá.
_LOAI_TO_SEGMENT = {
    "liền kề": "lien_ke", "lien ke": "lien_ke", "lienke": "lien_ke",
    "nhà phố": "lien_ke", "nha pho": "lien_ke", "townhouse": "lien_ke",
    "shophouse": "shophouse", "shop": "shophouse",
    "căn hộ": "can_ho", "can ho": "can_ho", "canho": "can_ho",
    "apartment": "can_ho", "chung cư": "can_ho", "chung cu": "can_ho",
    "biệt thự": "biet_thu", "biet thu": "biet_thu", "villa": "biet_thu",
}

# Trạng thái căn → hệ số ưu tiên (Đã bán bị loại trước khi tới đây).
_STATUS_WEIGHT = {
    "còn hàng": 1.0,
    "đặt cọc": 0.82,
}

# Trọng số tín hiệu (chỉ tính trên tín hiệu CÓ dữ liệu → tự chuẩn hoá).
_W_PRODUCT = 0.45
_W_BUDGET = 0.45
_W_REGION = 0.10


# ---------------------------------------------------------------------------
# Chuẩn hoá
# ---------------------------------------------------------------------------
def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _loai_segment(loai: Optional[str]) -> Optional[str]:
    return _LOAI_TO_SEGMENT.get(_norm(loai))


def _lead_segment(product_type: Optional[str]) -> Optional[str]:
    """Khoá phân khúc nhu cầu của khách. Tái dùng map của ai_salesman_store rồi
    bổ sung biệt thự. None nếu không xác định."""
    if not product_type:
        return None
    key = _norm(product_type)
    direct = _LOAI_TO_SEGMENT.get(key)
    if direct:
        return direct
    try:
        from app.core import ai_salesman_store

        return ai_salesman_store.map_product_type(product_type)
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# Parser ngân sách → (min_vnd, max_vnd). Robust với cách ghi tiếng Việt.
# ---------------------------------------------------------------------------
def parse_budget_vnd(value: Any) -> Optional[Tuple[float, float]]:
    """Đổi ngân sách (số hoặc chuỗi tiếng Việt) → dải VND (min, max).

    Hỗ trợ: "2 tỷ", "2,5 tỷ", "2-3 tỷ", "3 tỉ", "khoảng 2 tỷ", "trên 5 tỷ",
    "dưới 2 tỷ", "1500 triệu", số thuần "2500000000" hoặc 3 (=> 3 tỷ). None nếu
    không trích được số.
    """
    if value is None or value == "":
        return None

    # Số thuần.
    if isinstance(value, (int, float)):
        n = float(value)
        if n <= 0:
            return None
        vnd = n if n >= 1_000_000 else n * _TY
        return (vnd, vnd)

    text = str(value).strip().lower()
    if not text:
        return None

    # Đơn vị.
    if "tỷ" in text or "tỉ" in text or re.search(r"\bty\b", text) or re.search(r"\btỷ\b", text):
        unit = _TY
    elif "triệu" in text or re.search(r"\btr\b", text) or "trieu" in text:
        unit = _TRIEU
    else:
        unit = None

    # Trích các con số (cho phép '.'/',' làm phân tách).
    raw_nums = re.findall(r"\d[\d.,]*", text)
    nums: List[float] = []
    for raw in raw_nums:
        nums.append(_parse_number(raw))
    nums = [n for n in nums if n and n > 0]
    if not nums:
        return None

    # Suy đơn vị nếu chưa rõ: số lớn coi là VND; số nhỏ (<1000) coi là tỷ.
    if unit is None:
        unit = 1.0 if max(nums) >= 1_000_000 else _TY

    vals = sorted(n * unit for n in nums)

    has_min_word = bool(re.search(r"trên|tu |từ |hơn|>=|>", text))
    has_max_word = bool(re.search(r"dưới|toi da|tối đa|max|<=|<", text))

    if len(vals) == 1:
        v = vals[0]
        if has_min_word and not has_max_word:
            return (v, v * 1.6)
        if has_max_word and not has_min_word:
            return (v * 0.4, v)
        return (v, v)
    return (vals[0], vals[-1])


def _parse_number(raw: str) -> float:
    """Chuẩn hoá 1 token số tiếng Việt → float.

    Quy ước: nếu có cả '.' và ',' → '.' là phân tách nghìn, ',' là thập phân.
    Nếu chỉ có ',' → coi là thập phân (vd '2,5'). Nếu chỉ có '.' → nếu đứng sau
    đúng 3 chữ số (vd '1.500') coi là nghìn, ngược lại là thập phân.
    """
    raw = raw.strip()
    if not raw:
        return 0.0
    has_dot = "." in raw
    has_comma = "," in raw
    try:
        if has_dot and has_comma:
            return float(raw.replace(".", "").replace(",", "."))
        if has_comma:
            return float(raw.replace(",", "."))
        if has_dot:
            parts = raw.split(".")
            # '1.500' / '1.234.567' → nghìn; '2.5' → thập phân.
            if all(len(p) == 3 for p in parts[1:]):
                return float(raw.replace(".", ""))
            return float(raw)
        return float(raw)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# Giá căn → dải VND
# ---------------------------------------------------------------------------
def _unit_price_range(unit: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    gmin = unit.get("gia_min") or 0
    gmax = unit.get("gia_max") or 0
    try:
        gmin = float(gmin)
        gmax = float(gmax)
    except (TypeError, ValueError):
        gmin = gmax = 0
    if gmin > 0 and gmax > 0:
        return (min(gmin, gmax), max(gmin, gmax))
    gt = unit.get("gia_tri")
    try:
        gt = float(gt) if gt is not None else 0
    except (TypeError, ValueError):
        gt = 0
    if gt > 0:
        v = gt * _TY  # gia_tri tính bằng tỷ
        return (v, v)
    return None


# ---------------------------------------------------------------------------
# Chấm điểm từng tín hiệu (None = không có dữ liệu → bỏ khỏi trọng số)
# ---------------------------------------------------------------------------
def _budget_fit(
    budget: Optional[Tuple[float, float]], price: Optional[Tuple[float, float]]
) -> Tuple[Optional[float], str]:
    if not budget or not price:
        return None, ""
    blo, bhi = budget
    ulo, uhi = price
    # Dải điểm: nới ±12% nếu khách chỉ nêu 1 mức.
    if blo == bhi:
        blo, bhi = blo * 0.88, bhi * 1.12
    if uhi < blo:  # căn rẻ hơn ngân sách → vẫn tốt (ít phạt)
        gap = (blo - uhi) / blo if blo else 1.0
        score = max(0.0, 1.0 - gap * 1.4)
        return score, "Dưới ngân sách" if score >= 0.6 else "Thấp hơn nhiều so với ngân sách"
    if ulo > bhi:  # căn đắt hơn ngân sách → phạt nặng hơn
        gap = (ulo - bhi) / bhi if bhi else 1.0
        score = max(0.0, 1.0 - gap * 2.2)
        pct = int(round(gap * 100))
        return score, f"Cao hơn ngân sách ~{pct}%"
    return 1.0, "Trong tầm ngân sách"


def _product_fit(
    lead_seg: Optional[str], unit_seg: Optional[str]
) -> Tuple[Optional[float], str]:
    if not lead_seg:
        return None, ""
    if not unit_seg:
        return 0.0, ""
    if lead_seg == unit_seg:
        return 1.0, "Khớp loại hình khách quan tâm"
    # Liền kề / biệt thự / shophouse đều là sản phẩm thấp tầng → gần nhau một phần.
    low_rise = {"lien_ke", "biet_thu", "shophouse"}
    if lead_seg in low_rise and unit_seg in low_rise:
        return 0.3, "Cùng nhóm sản phẩm thấp tầng"
    return 0.0, ""


def _region_fit(
    lead: Dict[str, Any], unit: Dict[str, Any]
) -> Tuple[Optional[float], str]:
    region = _norm(lead.get("region"))
    project = _norm(lead.get("project"))
    phan_khu = _norm(unit.get("phan_khu"))
    if not phan_khu or (not region and not project):
        return None, ""
    for hay in (region, project):
        if hay and (hay in phan_khu or phan_khu in hay):
            return 1.0, f"Đúng khu vực {unit.get('phan_khu')}"
    return None, ""  # không khớp khu vực → bỏ qua (không phạt)


# ---------------------------------------------------------------------------
# API chính
# ---------------------------------------------------------------------------
def _unit_view(unit: Dict[str, Any], percent: int, reasons: List[str]) -> Dict[str, Any]:
    return {
        "id": unit.get("id"),
        "lo": unit.get("lo"),
        "phan_khu": unit.get("phan_khu"),
        "loai": unit.get("loai"),
        "dien_tich": unit.get("dien_tich"),
        "mat_tien": unit.get("mat_tien"),
        "trang_thai": unit.get("trang_thai"),
        "gia": unit.get("gia"),
        "gia_tri": unit.get("gia_tri"),
        "huong": unit.get("huong"),
        "view": unit.get("view"),
        "position": unit.get("position"),
        "match_percent": percent,
        "reasons": reasons,
    }


def match_units_for_needs(
    *,
    product_type: Optional[str] = None,
    budget: Any = None,
    region: Optional[str] = None,
    project: Optional[str] = None,
    limit: int = 3,
    min_percent: int = 0,
    units: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Khớp quỹ căn với nhu cầu rời rạc → danh sách căn + % phù hợp (giảm dần).

    `units` truyền sẵn để test; None → đọc từ inventory (mock fallback an toàn).
    """
    try:
        if units is None:
            from app.api import inventory as inventory_api  # lazy: tránh cycle lúc load

            units = inventory_api.get_units()
    except Exception as exc:  # noqa: BLE001 — không có inventory → không gợi ý
        log.warning("match_units_for_needs: không đọc được inventory: %s", exc)
        return []

    lead_like = {"region": region, "project": project}
    lead_seg = _lead_segment(product_type)
    budget_range = parse_budget_vnd(budget)

    scored: List[Tuple[float, int, Dict[str, Any]]] = []
    for u in units or []:
        status = _norm(u.get("trang_thai"))
        if status.startswith("đã bán") or status == "đã bán" or status == "da ban":
            continue  # loại căn đã bán
        avail = _STATUS_WEIGHT.get(status, 0.7)

        reasons: List[str] = []
        weighted = 0.0
        wsum = 0.0

        ps, pr = _product_fit(lead_seg, _loai_segment(u.get("loai")))
        if ps is not None:
            weighted += ps * _W_PRODUCT
            wsum += _W_PRODUCT
            if pr:
                reasons.append(pr)

        bs, br = _budget_fit(budget_range, _unit_price_range(u))
        if bs is not None:
            weighted += bs * _W_BUDGET
            wsum += _W_BUDGET
            if br:
                reasons.append(br)

        rs, rr = _region_fit(lead_like, u)
        if rs is not None:
            weighted += rs * _W_REGION
            wsum += _W_REGION
            if rr:
                reasons.append(rr)

        if wsum > 0:
            base = weighted / wsum
        else:
            # Không có tín hiệu nhu cầu nào → gợi ý chung theo độ sẵn hàng.
            base = 0.4
            reasons.append("Chưa đủ thông tin nhu cầu — gợi ý căn còn hàng tiêu biểu")

        if status.startswith("còn hàng"):
            reasons.append("Còn hàng")
        percent = int(round(base * avail * 100))
        if percent < min_percent:
            continue
        scored.append((base * avail, percent, _unit_view(u, percent, reasons)))

    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [item[2] for item in scored[: max(1, int(limit))]]


def match_for_lead(
    lead: Dict[str, Any], *, limit: int = 3, min_percent: int = 0
) -> List[Dict[str, Any]]:
    """Khớp căn cho 1 lead/hồ sơ (đọc product_type/budget/region/project từ dict)."""
    return match_units_for_needs(
        product_type=lead.get("product_type"),
        budget=lead.get("budget"),
        region=lead.get("region"),
        project=lead.get("project"),
        limit=limit,
        min_percent=min_percent,
    )
