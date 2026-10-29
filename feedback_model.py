"""SQLModel table for feedback. Screenshot is base64 (served back as an image)."""

from datetime import datetime, timezone

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Feedback(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # Drop these two + the user_id FK if you allow anonymous feedback.
    user_name: str = ""
    user_email: str = ""
    kind: str = "general"  # bug | feature | general
    message: str = ""
    page_url: str | None = None
    screenshot: str | None = Field(default=None, sa_column=Column(Text))  # base64, no data: prefix
    content_type: str = "image/jpeg"
    notion_synced: bool = False
    created_at: datetime = Field(default_factory=_utcnow, index=True)
