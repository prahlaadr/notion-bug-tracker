# INTEGRATE.md — runbook for adding this bug reporter to an app

You (Claude) are integrating the Notion Bug Tracker widget into the current app.
This tool is a **template, not a package**: you copy the files in and wire three
backend seams by hand. Follow the steps in order. Ask the user only for the two
things you cannot discover: their Notion token and which page to put the DB under.

Target stack: **React frontend + FastAPI backend**. If the app isn't this stack,
stop and tell the user what's different (e.g. Next.js API routes, a non-SQLModel
ORM) so the two of you can adapt the router before proceeding.

---

## 0. Discover the app before copying anything

Find and note:
- Frontend: the React entry/root component, its CSS convention, package manager
  (bun / npm / pnpm), and how the API base URL is configured (e.g. `VITE_API_URL`).
- Backend: where `FastAPI()` is created and routers are `include_router`'d; the
  session/DB provider (a `get_session()` or SQLAlchemy `Session` dependency); the
  models module and how tables are created (`SQLModel.metadata.create_all`, Alembic,
  etc.); and whether there's an auth dependency (something like `current_user`).
- Whether feedback should be **logged-in-only** (reports show who sent them) or
  **anonymous**. Ask the user if it's not obvious.

## 1. Frontend

1. Copy `FeedbackWidget.tsx`, `ScreenshotAnnotator.tsx`, `feedback-widget.css`
   into the frontend source tree (keep them together; the widget imports the other two).
2. Install the one dependency: `bun add html-to-image` (or npm/pnpm equivalent).
3. Mount the widget near the app root:
   ```tsx
   import { FeedbackWidget } from "./FeedbackWidget";
   // apiBase = your API origin; token = the auth bearer, or omit/null if public
   <FeedbackWidget apiBase={API_BASE} token={authToken} />
   ```
   For logged-in-only, render it only when a user is present (`{user && <FeedbackWidget .../>}`).
4. Restyle: `feedback-widget.css` is self-contained and neutral. Adjust the color
   tokens (`.fb-fab`, `.fb-btn-primary`, etc.) to match the app if desired. Do not
   rename the `feedback-root` class — the screenshot capture filters it out by name.

## 2. Backend — the three wire seams

`feedback_router.py` has three module-level imports that WILL crash on import in
an app that doesn't have those exact modules. Fix each explicitly:

```python
from app.auth import current_user   # (A) auth dependency
from app.db import get_session       # (B) session provider
from app.models import Feedback, User  # (C) models
```

**(A) Auth.** Repoint `current_user` to the app's real auth dependency.
- Logged-in-only: keep `Depends(current_user)` on `POST /feedback`; make sure the
  user object exposes `.name` and `.email` (adapt the field names in `submit_feedback`).
- Anonymous: remove the `Depends(...)`, drop the `User` import, and delete the
  `user_name` / `user_email` / `user_id` fields from both the handler and the model.

**(B) Session.** Repoint `get_session` to the app's session factory. It must work as
`with get_session() as s: s.add(...); s.commit(); s.refresh(fb); s.get(Feedback, id)`.
If the app hands sessions via `Depends`, switch the two usages to that pattern.

**(C) Model + table.** Copy `feedback_model.py` in (or paste the `Feedback` class
into the app's models module) and import it from wherever the router expects.
Then make sure the table gets created: if the app uses `create_all`, importing the
model before that call is enough; if it uses Alembic/another migration tool,
generate a migration for the new `feedback` table.

Finally, register the router where other routers are included:
```python
from app.feedback_router import router as feedback_router
app.include_router(feedback_router)
```

## 3. Notion

Do this with the user (their token, their workspace). See `setup_notion.py`:
1. User creates an internal integration at notion.so/my-integrations → token.
2. User picks a parent page, shares it with the integration (••• → Connections),
   and gives you the page id (32 hex chars in the page URL).
3. Provision the DB:
   ```
   NOTION_TOKEN=<token> python setup_notion.py <parent_page_id>
   ```
   It prints `NOTION_FEEDBACK_DB=<id>`. The `Screenshot` files property is required
   and the script creates it; a hand-built DB missing it makes the Notion push 400.

## 4. Env

Set on the backend:
```
NOTION_TOKEN=<integration token>
NOTION_FEEDBACK_DB=<db id from step 3>
API_BASE=<public API origin>   # used to build screenshot URLs Notion embeds
```
Notion push is best-effort: if these are unset, feedback still saves to the app DB.
`API_BASE` must be publicly reachable for the screenshot to render inside Notion.

## 5. Verify

1. Run frontend + backend. The 💬 button appears (when logged in, if gated).
2. Open it, pick a type, type a message, Attach screenshot → the annotator opens.
   Draw a rect/arrow, add a text label, Attach, then Submit.
3. Confirm a row was written to the app DB (a `feedback` row with base64 screenshot).
4. Confirm a page appeared in the Notion DB with the annotated screenshot embedded.
   If the row is in the app DB but not Notion, the push failed silently (bare
   `except`): check the token, the DB id, that the integration is shared with the
   DB, and that the `Screenshot` files property exists.
