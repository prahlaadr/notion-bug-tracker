import { useState, type FormEvent } from "react";
import { toJpeg } from "html-to-image";
import { ScreenshotAnnotator } from "./ScreenshotAnnotator";
import "./feedback-widget.css";

/**
 * Drop-in feedback widget. Posts to `${apiBase}/feedback` with an Authorization
 * bearer token (omit `token` if your endpoint is public). Screenshot captures the
 * current view minus the widget itself.
 */
export function FeedbackWidget({ apiBase, token }: { apiBase: string; token?: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"bug" | "feature" | "general">("general");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState<string | null>(null); // src being edited
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function capture() {
    try {
      const dataUrl = await toJpeg(document.body, {
        quality: 0.6,
        pixelRatio: 0.6,
        filter: (n) => !(n instanceof HTMLElement && n.classList?.contains("feedback-root")),
      });
      setAnnotating(dataUrl); // open the annotate-before-send editor
    } catch {
      /* ignore */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() && !shot) return;
    setBusy(true);
    try {
      await fetch(`${apiBase}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kind, message, page_url: window.location.href, screenshot: shot }),
      });
      setSent(true);
      setTimeout(() => { setOpen(false); setSent(false); setMessage(""); setShot(null); setAnnotating(null); setKind("general"); }, 1200);
    } catch {
      /* keep open on failure */
    } finally {
      setBusy(false);
    }
  }

  const kinds: [typeof kind, string][] = [["bug", "🐞 Bug"], ["feature", "💡 Feature"], ["general", "💬 General"]];

  return (
    <div className="feedback-root">
      {!open && <button className="fb-fab" onClick={() => setOpen(true)} aria-label="Send feedback">💬</button>}
      {open && (
        <div className="fb-card">
          {sent ? (
            <div className="fb-thanks">Thanks! 🙌<br /><span>Your feedback was sent.</span></div>
          ) : (
            <form onSubmit={submit}>
              <h3>Send Feedback</h3>
              <div className="fb-kinds">
                {kinds.map(([k, label]) => (
                  <button type="button" key={k} className={`fb-kind ${kind === k ? "active" : ""}`} onClick={() => setKind(k)}>{label}</button>
                ))}
              </div>
              <textarea className="fb-text" placeholder="Tell us what's on your mind…" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
              {shot ? (
                <div className="fb-shot">
                  <img src={shot} alt="screenshot" />
                  <button type="button" className="fb-link" onClick={() => setAnnotating(shot)}>edit</button>
                  <button type="button" className="fb-link" onClick={() => setShot(null)}>remove</button>
                </div>
              ) : (
                <button type="button" className="fb-link" onClick={capture}>📷 Attach screenshot</button>
              )}
              <div className="fb-actions">
                <button type="button" className="fb-btn" onClick={() => setOpen(false)}>Cancel</button>
                <button className="fb-btn fb-btn-primary" disabled={busy || (!message.trim() && !shot)}>{busy ? "…" : "Submit"}</button>
              </div>
            </form>
          )}
        </div>
      )}
      {annotating && (
        <ScreenshotAnnotator
          src={annotating}
          onCancel={() => setAnnotating(null)}
          onDone={(url) => { setShot(url); setAnnotating(null); }}
        />
      )}
    </div>
  );
}
