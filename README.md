# Notion Bug Tracker

A drop-in **in-app feedback widget** (bug / feature / general + screenshot) that
collects feedback from your users and pushes it into a **Notion database**, with
a reliable DB copy as the source of truth.

Built for the OOP Fantasy Stock Basket; extracted here to reuse on any app with a
React frontend + FastAPI backend.

## What you get

- A floating **feedback button** → modal: Bug / Feature / General, a message box,
  and "Attach screenshot" (captures the current view via `html-to-image`, minus
  the widget itself).
- A **Shottr-style annotator** that opens on capture: draw rect / arrow / pen /
  text on the screenshot before sending, with undo / clear (`ScreenshotAnnotator.tsx`).
- Backend `POST /feedback` that stores each submission and **best-effort pushes to
  Notion** (a row per submission, screenshot embedded as an image).
- `GET /feedback/screenshot/{id}` serves the screenshot at a public URL so Notion
  can embed it (no external file host needed).
- Optional: gate to **logged-in users only** so every report shows who sent it.

Files:
- `FeedbackWidget.tsx` — the React component (+ `feedback-widget.css`).
- `ScreenshotAnnotator.tsx` — the annotate-before-send editor (self-contained).
- `feedback_router.py` — the FastAPI router + Notion push + screenshot endpoint.
- `feedback_model.py` — the SQLModel table.
- `setup_notion.py` — one-shot: creates the Notion DB with the right schema.
- `INTEGRATE.md` — the step-by-step runbook for dropping this into an app.

## Setup (per app)

### 1. Notion
1. Create a **Notion internal integration** (notion.so/my-integrations) and note
   its **token** (`ntn_...` / `secret_...`).
2. Pick a **parent page** to hold the feedback DB and share it with the integration
   (••• → Connections → your integration). Copy the page's 32-char id from its URL.
3. Create the database. Easiest: let the script do it with the exact schema:
   ```
   NOTION_TOKEN=<token> python setup_notion.py <parent_page_id>
   ```
   It prints the `NOTION_FEEDBACK_DB` id to use. If you'd rather build it by hand,
   the properties are: `Name` (title), `Type` (select: Bug/Feature/General),
   `Message` (text), `From` (text), `Page` (url), `Screenshot` (files). The
   `Screenshot` files property is required, or the Notion push fails; screenshots
   also appear as an embedded image block in each row's body.

### 2. Backend (FastAPI)
- Copy `feedback_router.py` + `feedback_model.py` into your app.
- Include the router; set env vars:
  ```
  NOTION_TOKEN=<integration token>
  NOTION_FEEDBACK_DB=<database id>
  API_BASE=<your public API base, e.g. https://api.example.com>   # for screenshot URLs
  ```
- Deps: FastAPI, SQLModel (or adapt the model to your ORM). Notion + screenshot
  serving use only the standard library (`urllib`, `base64`).
- If you want logged-in-only, keep the `Depends(current_user)` on `POST /feedback`
  and pass your user's name/email through.

### 3. Frontend (React)
- `bun add html-to-image` (or npm/pnpm).
- Copy `FeedbackWidget.tsx` + `ScreenshotAnnotator.tsx` + `feedback-widget.css`;
  render `<FeedbackWidget apiBase={API} token={authToken} />` wherever it should
  appear (e.g. only when logged in). Omit `token` if the endpoint is public.
- Restyle the CSS tokens to match your app.

## How it works

Frontend captures the DOM to a compressed JPEG (excluding the widget), POSTs
`{ kind, message, page_url, screenshot }` to the backend. The backend stores it
(reliable), then creates a Notion page in your database and embeds the screenshot
via `API_BASE/feedback/screenshot/{id}`. Notion push is best-effort: if the token
is missing or Notion is down, the DB copy still has everything.

## Why a DB copy + Notion (not Notion only)

Notion's API can rate-limit or fail; storing in your own DB first means you never
lose a report, and you can build an in-app admin view. Notion is the friendly
shared inbox on top.
