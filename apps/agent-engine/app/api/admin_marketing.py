"""API AI Marketing (admin) — chiến dịch đa kênh + hiệu suất + AI sản xuất nội dung.

Prefix /admin/marketing (require_admin). Gồm 4 nhóm:

Chiến dịch:
  GET    /admin/marketing/campaigns                 → danh sách (lọc channel/status)
  POST   /admin/marketing/campaigns                 → tạo mới
  GET    /admin/marketing/campaigns/{id}            → chi tiết + hiệu suất
  PATCH  /admin/marketing/campaigns/{id}            → cập nhật
  POST   /admin/marketing/campaigns/{id}/spend      → cập nhật chi tiêu
  DELETE /admin/marketing/campaigns/{id}            → xoá

Hiệu suất:
  GET    /admin/marketing/overview                  → KPI + theo kênh + từng campaign

Nội dung AI:
  POST   /admin/marketing/content/generate          → sinh nội dung (Claude/fallback)
  GET    /admin/marketing/content                   → lịch sử nội dung
  DELETE /admin/marketing/content/{id}              → xoá bản ghi nội dung

Gợi ý AI:
  POST   /admin/marketing/suggest                   → gợi ý chiến dịch theo hiệu suất

Nguyên tắc AN TOÀN: thiếu API key / lỗi gọi Claude → fallback template (không 500).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, require_admin
from app.core import ai_marketing, lead_store, marketing_store
from app.schemas.marketing import (
    Campaign,
    CampaignCreate,
    CampaignPerformance,
    CampaignSuggestResponse,
    CampaignUpdate,
    ContentGenerateRequest,
    ContentGenerateResponse,
    ContentItem,
    MarketingOverview,
    SpendUpdate,
)
from app.core.settings import settings

router = APIRouter(prefix="/admin/marketing", tags=["admin", "marketing"])


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# Hiệu suất — gắn lead theo source/utm
# ---------------------------------------------------------------------------

def _all_leads() -> list[dict]:
    """Toàn bộ lead (public_view) để tính hiệu suất. Bọc an toàn nếu store rỗng."""
    try:
        page = lead_store.list_all_leads(page=1, page_size=100000)
        return page.get("items", [])
    except Exception:  # noqa: BLE001 — store lỗi không làm chết overview
        return []


def _match_key(campaign: dict) -> str:
    """Khoá để khớp lead với campaign: ưu tiên utm_source, fallback name."""
    return (campaign.get("utm_source") or campaign.get("name") or "").strip()


def _campaign_perf(campaign: dict, leads: list[dict], rev_per_customer: float) -> dict:
    key = _match_key(campaign).lower()
    matched = [l for l in leads if (l.get("source") or "").strip().lower() == key] if key else []
    n_leads = len(matched)
    customers = sum(1 for l in matched if l.get("status") == "customer")
    spent = float(campaign.get("spent") or 0)
    cpl = (spent / n_leads) if n_leads else 0.0
    conv = (customers / n_leads) if n_leads else 0.0
    est_revenue = customers * rev_per_customer
    roi = ((est_revenue - spent) / spent) if spent else 0.0
    return {
        "campaign_id": campaign.get("id"),
        "name": campaign.get("name"),
        "channel": campaign.get("channel") or "other",
        "status": campaign.get("status") or "draft",
        "budget": float(campaign.get("budget") or 0),
        "spent": spent,
        "leads": n_leads,
        "customers": customers,
        "cpl": round(cpl, 2),
        "conversion_rate": round(conv, 4),
        "est_revenue": round(est_revenue, 2),
        "roi": round(roi, 4),
    }


def _build_overview() -> dict:
    campaigns = marketing_store.list_campaigns()
    leads = _all_leads()
    rev_per_customer = float(settings.marketing_revenue_per_customer or 0)

    perfs = [_campaign_perf(c, leads, rev_per_customer) for c in campaigns]

    # Gộp theo kênh.
    by_channel: dict[str, dict] = {}
    for p in perfs:
        ch = p["channel"]
        agg = by_channel.setdefault(ch, {
            "channel": ch, "campaigns": 0, "spent": 0.0, "leads": 0,
            "customers": 0, "cpl": 0.0, "est_revenue": 0.0, "roi": 0.0,
        })
        agg["campaigns"] += 1
        agg["spent"] += p["spent"]
        agg["leads"] += p["leads"]
        agg["customers"] += p["customers"]
        agg["est_revenue"] += p["est_revenue"]
    for agg in by_channel.values():
        agg["cpl"] = round((agg["spent"] / agg["leads"]) if agg["leads"] else 0.0, 2)
        agg["roi"] = round(
            ((agg["est_revenue"] - agg["spent"]) / agg["spent"]) if agg["spent"] else 0.0, 4
        )
        agg["est_revenue"] = round(agg["est_revenue"], 2)
        agg["spent"] = round(agg["spent"], 2)

    total_spent = sum(p["spent"] for p in perfs)
    total_leads = sum(p["leads"] for p in perfs)
    total_customers = sum(p["customers"] for p in perfs)
    total_budget = sum(p["budget"] for p in perfs)
    est_revenue = sum(p["est_revenue"] for p in perfs)
    avg_cpl = (total_spent / total_leads) if total_leads else 0.0
    roi = ((est_revenue - total_spent) / total_spent) if total_spent else 0.0

    return {
        "total_campaigns": len(campaigns),
        "running_campaigns": sum(1 for c in campaigns if c.get("status") == "running"),
        "total_budget": round(total_budget, 2),
        "total_spent": round(total_spent, 2),
        "total_leads": total_leads,
        "total_customers": total_customers,
        "avg_cpl": round(avg_cpl, 2),
        "est_revenue": round(est_revenue, 2),
        "roi": round(roi, 4),
        "est_revenue_per_customer": rev_per_customer,
        "by_channel": sorted(by_channel.values(), key=lambda x: x["leads"], reverse=True),
        "campaigns": perfs,
        "generated_at": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Campaign CRUD
# ---------------------------------------------------------------------------

@router.get("/campaigns")
def list_campaigns(
    channel: str | None = None,
    status: str | None = None,
    _admin: dict = Depends(require_admin),
) -> dict:
    rows = marketing_store.list_campaigns(channel=channel, status=status)
    return {"campaigns": [Campaign(**c).model_dump() for c in rows], "count": len(rows)}


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CampaignCreate, _admin: dict = Depends(require_admin)
) -> Campaign:
    created = marketing_store.create_campaign(payload.model_dump())
    return Campaign(**created)


@router.get("/campaigns/{campaign_id}")
def get_campaign(
    campaign_id: str, _admin: dict = Depends(require_admin)
) -> dict:
    c = marketing_store.get_campaign(campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy chiến dịch")
    leads = _all_leads()
    rev = float(settings.marketing_revenue_per_customer or 0)
    perf = _campaign_perf(c, leads, rev)
    return {
        "campaign": Campaign(**c).model_dump(),
        "performance": CampaignPerformance(**perf).model_dump(),
    }


@router.patch("/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: str, payload: CampaignUpdate, _admin: dict = Depends(require_admin)
) -> Campaign:
    updated = marketing_store.update_campaign(
        campaign_id, payload.model_dump(exclude_unset=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy chiến dịch")
    return Campaign(**updated)


@router.post("/campaigns/{campaign_id}/spend")
def update_spend(
    campaign_id: str, payload: SpendUpdate, _admin: dict = Depends(require_admin)
) -> Campaign:
    if payload.spent is None and payload.add is None:
        raise HTTPException(status_code=400, detail="Cần truyền 'spent' hoặc 'add'.")
    updated = marketing_store.set_spent(
        campaign_id, spent=payload.spent, add=payload.add
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy chiến dịch")
    return Campaign(**updated)


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(
    campaign_id: str, _admin: dict = Depends(require_admin)
) -> dict:
    ok = marketing_store.delete_campaign(campaign_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy chiến dịch")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Overview hiệu suất
# ---------------------------------------------------------------------------

@router.get("/overview")
def overview(_admin: dict = Depends(require_admin)) -> MarketingOverview:
    return MarketingOverview(**_build_overview())


# ---------------------------------------------------------------------------
# AI sản xuất nội dung
# ---------------------------------------------------------------------------

@router.post("/content/generate")
async def generate_content(
    payload: ContentGenerateRequest, user: dict = Depends(require_admin)
) -> ContentGenerateResponse:
    variants, used_llm = await ai_marketing.generate_content(payload.model_dump())
    record = marketing_store.add_content({
        "content_type": payload.content_type,
        "channel": payload.channel,
        "product": payload.product,
        "audience": payload.audience,
        "tone": payload.tone,
        "length": payload.length,
        "variants": variants,
        "used_llm": used_llm,
        "campaign_id": payload.campaign_id,
        "created_by": user.get("id"),
    })
    msg = None if used_llm else "Chưa bật AI (thiếu API key) — đang dùng mẫu nội dung gợi ý."
    return ContentGenerateResponse(
        item=ContentItem(**record), used_llm=used_llm, message=msg
    )


@router.get("/content")
def list_content(
    limit: int = 50,
    content_type: str | None = None,
    channel: str | None = None,
    _admin: dict = Depends(require_admin),
) -> dict:
    rows = marketing_store.list_content(
        limit=limit, content_type=content_type, channel=channel
    )
    return {"content": [ContentItem(**r).model_dump() for r in rows], "count": len(rows)}


@router.delete("/content/{content_id}")
def delete_content(
    content_id: str, _admin: dict = Depends(require_admin)
) -> dict:
    ok = marketing_store.delete_content(content_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Gợi ý chiến dịch bằng AI
# ---------------------------------------------------------------------------

@router.post("/suggest")
async def suggest_campaigns(
    _admin: dict = Depends(require_admin),
) -> CampaignSuggestResponse:
    overview_data = _build_overview()
    channel_perf = overview_data.get("by_channel", [])
    suggestions, used_llm = await ai_marketing.suggest_campaigns(channel_perf)
    msg = None if used_llm else "Chưa bật AI — đang dùng gợi ý mặc định."
    return CampaignSuggestResponse(
        suggestions=suggestions, used_llm=used_llm, message=msg
    )
