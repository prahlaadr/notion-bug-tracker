#!/usr/bin/env python3
"""One-shot: create the feedback Notion database with the exact schema the widget
expects, and print its id to paste into NOTION_FEEDBACK_DB.

Notion databases can't be created at the workspace root, so you provide a PARENT
PAGE and share it with your integration first:
  1. notion.so/my-integrations -> create an internal integration -> copy the token.
  2. Open (or make) a page to hold the feedback DB. ... -> Connections -> add your
     integration so it can write there. Copy the page id (the 32 hex chars at the
     end of the page URL).

Then:
  NOTION_TOKEN=ntn_xxx python setup_notion.py <parent_page_id>
  # or: NOTION_TOKEN=... NOTION_PARENT_PAGE=... python setup_notion.py

Stdlib only. Type-select options auto-create on write, but the Screenshot files
property must exist up front or the widget's Notion push 400s, so we provision it.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

TOKEN = os.getenv("NOTION_TOKEN", "")
PARENT = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("NOTION_PARENT_PAGE", "")).strip()

SCHEMA = {
    "Name": {"title": {}},
    "Type": {"select": {"options": [
        {"name": "Bug", "color": "red"},
        {"name": "Feature", "color": "blue"},
        {"name": "General", "color": "gray"},
    ]}},
    "Message": {"rich_text": {}},
    "From": {"rich_text": {}},
    "Page": {"url": {}},
    "Screenshot": {"files": {}},
}


def main() -> int:
    if not TOKEN:
        sys.exit("Set NOTION_TOKEN (your integration token).")
    if not PARENT:
        sys.exit("Pass the parent page id as an argument (or set NOTION_PARENT_PAGE).")

    body = {
        "parent": {"type": "page_id", "page_id": PARENT},
        "title": [{"type": "text", "text": {"content": "App Feedback"}}],
        "properties": SCHEMA,
    }
    req = urllib.request.Request(
        "https://api.notion.com/v1/databases",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            db = json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"Notion API {e.code}: {detail}\n\n"
                 "Common cause: the integration isn't shared with the parent page "
                 "(open the page -> ... -> Connections -> add it).")

    db_id = db["id"].replace("-", "")
    print(f"\nCreated feedback database.")
    print(f"  URL:  {db.get('url', '(n/a)')}")
    print(f"\nSet this in your backend env:")
    print(f"  NOTION_FEEDBACK_DB={db_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
