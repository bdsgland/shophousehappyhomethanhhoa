"""Schema lead — dùng tạm in-memory, sau này map sang DB."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

LeadStatus = Literal["new", "nurturing", "hot", "handed_off", "lost"]


class Lead(BaseModel):
    id: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source_channel: str = "web"
    # Dự án quan tâm — phân tách lead theo dự án để dashboard nhóm/lọc.
    project: Optional[str] = Field(
        default=None, description='Tên dự án dạng hiển thị, vd "Eurowindow Light City"'
    )
    project_slug: Optional[str] = Field(
        default=None, description='Slug dự án (machine-readable), vd "eurowindow-light-city"'
    )
    facebook_url: Optional[str] = None
    notes: Optional[str] = None
    status: LeadStatus = "new"
    intent_score: int = Field(default=0, ge=0, le=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LeadCreate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source_channel: str = "web"
    project: Optional[str] = None
    project_slug: Optional[str] = None
    facebook_url: Optional[str] = None
    notes: Optional[str] = None
