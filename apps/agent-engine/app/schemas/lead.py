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
    interested_project_slug: Optional[str] = None
    status: LeadStatus = "new"
    intent_score: int = Field(default=0, ge=0, le=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LeadCreate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source_channel: str = "web"
    interested_project_slug: Optional[str] = None
