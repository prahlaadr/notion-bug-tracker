"""FastAPI router: POST /feedback (store + push to Notion) and a public
GET /feedback/screenshot/{id}. Notion + screenshot use only the stdlib.

Wire-up:
  - Provide `get_session()` (SQLModel Session) and the `Feedback` model.
  - Auth: keep `Depends(current_user)` for logged-in-only, or delete it and the
    user_* fields for anonymous feedback.
  - Env: NOTION_TOKEN, NOTION_FEEDBACK_DB, API_BASE.
  - Notion DB properties expected: Name(title), Type(select), Message(text),
    From(text), Page(url).
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

# --- wire these to your app -------------------------------------------------
from app.auth import current_user  # your auth dependency (or remove)
from app.db import get_session
from app.models import Feedback, User
# ---------------------------------------------------------------------------

router = APIRouter(tags=["feedback"])

NOTION_TOKEN = os.getenv("NOTION_TOKEN", "")
NOTION_DB = os.getenv("NOTION_FEEDBACK_DB", "")
API_BASE = os.getenv("API_BASE", "")
NOTION_ENABLED = bool(NOTION_TOKEN and NOTION_DB)


class FeedbackReq(BaseModel):
    kind: str = "general"
    message: str = ""
    page_url: str | None = None
    screenshot: str | None = None  # data URL "data:image/jpeg;base64,..."


def _push_to_notion(fb: "Feedback") -> None:
    if not NOTION_ENABLED:
        return
    title = fb.message.strip()[:70] or f"{fb.kind.capitalize()} feedback"
    props = {
        "Name": {"title": [{"text": {"content": title}}]},
        "Type": {"select": {"name": fb.kind.capitalize()}},
        "Message": {"rich_text": [{"text": {"content": fb.message[:1900]}}]},
        "From": {"rich_text": [{"text": {"content": f"{fb.user_name} <{fb.user_email}>"}}]},
    }
    if fb.page_url:
        props["Page"] = {"url": fb.page_url}
    children = []
    if fb.screenshot and API_BASE:
        shot_url = f"{API_BASE}/feedback/screenshot/{fb.id}"
        # add a "Screenshot" files property to your DB so it shows in the table view
        props["Screenshot"] = {"files": [{"type": "external", "name": "screenshot.jpg", "external": {"url": shot_url}}]}
        children.append({
            "object": "block", "type": "image",
            "image": {"type": "external", "external": {"url": shot_url}},
        })
    body = {"parent": {"database_id": NOTION_DB}, "properties": props, "children": children}
    req = urllib.request.Request(
        "https://api.notion.com/v1/pages",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"},
    )
    urllib.request.urlopen(req, timeout=10)


@router.post("/feedback")
def submit_feedback(req: FeedbackReq, user: "User" = Depends(current_user)):
    if not req.message.strip() and not req.screenshot:
        raise HTTPException(status_code=400, detail="empty feedback")
    b64, ct = None, "image/jpeg"
    if req.screenshot and req.screenshot.startswith("data:"):
        header, _, data = req.screenshot.partition(",")
        b64 = data
        if "image/png" in header:
            ct = "image/png"
    with get_session() as s:
        fb = Feedback(
            user_name=user.name, user_email=user.email,
            kind=req.kind if req.kind in ("bug", "feature", "general") else "general",
            message=req.message.strip(), page_url=req.page_url, screenshot=b64, content_type=ct,
        )
        s.add(fb)
        s.commit()
        s.refresh(fb)
        try:
            _push_to_notion(fb)
            fb.notion_synced = True
            s.add(fb)
            s.commit()
        except Exception:
            pass  # DB copy is the source of truth; Notion is best-effort
        return {"ok": True, "id": fb.id}


@router.get("/feedback/screenshot/{fid}")
def feedback_screenshot(fid: int):
    with get_session() as s:
        fb = s.get(Feedback, fid)
        if not fb or not fb.screenshot:
            raise HTTPException(status_code=404, detail="no screenshot")
        return Response(content=base64.b64decode(fb.screenshot), media_type=fb.content_type)
