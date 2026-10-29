import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Shottr-style screenshot annotator (rect / arrow / pen / text). Self-contained:
 * styles live in feedback-widget.css under `.fb-anno-*`, no app CSS needed.
 * Opens full-screen over a captured screenshot; `onDone` returns a JPEG data URL
 * with the annotations composited in.
 */
type Anno =
  | { t: "rect" | "arrow"; x1: number; y1: number; x2: number; y2: number; c: string }
  | { t: "pen"; pts: [number, number][]; c: string }
  | { t: "text"; x: number; y: number; text: string; c: string };

const ANNO_COLORS = ["#f0436a", "#ffe400", "#1aa06a", "#141414"];

function drawAnno(ctx: CanvasRenderingContext2D, a: Anno, lw: number) {
  ctx.strokeStyle = a.c;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (a.t === "pen") {
    ctx.beginPath();
    a.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    return;
  }
  if (a.t === "rect") {
    ctx.strokeRect(Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1));
    return;
  }
  if (a.t === "text") {
    const fs = Math.max(14, lw * 5);
    ctx.fillStyle = a.c;
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(a.text, a.x, a.y);
    return;
  }
  // arrow
  ctx.beginPath();
  ctx.moveTo(a.x1, a.y1);
  ctx.lineTo(a.x2, a.y2);
  ctx.stroke();
  const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
  const head = Math.max(12, lw * 4);
  ctx.beginPath();
  ctx.moveTo(a.x2, a.y2);
  ctx.lineTo(a.x2 - head * Math.cos(ang - Math.PI / 7), a.y2 - head * Math.sin(ang - Math.PI / 7));
  ctx.moveTo(a.x2, a.y2);
  ctx.lineTo(a.x2 - head * Math.cos(ang + Math.PI / 7), a.y2 - head * Math.sin(ang + Math.PI / 7));
  ctx.stroke();
}

export function ScreenshotAnnotator({ src, onDone, onCancel }: { src: string; onDone: (url: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<"rect" | "arrow" | "pen" | "text">("rect");
  const [color, setColor] = useState(ANNO_COLORS[0]);
  const [shapes, setShapes] = useState<Anno[]>([]);
  const [draft, setDraft] = useState<Exclude<Anno, { t: "text" }> | null>(null); // drag shapes only
  const [textEdit, setTextEdit] = useState<{ cx: number; cy: number; left: number; top: number } | null>(null);
  const [textVal, setTextVal] = useState("");

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setNat({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = src;
  }, [src]);

  const lw = nat ? Math.max(2, Math.round(nat.w / 260)) : 3;

  useEffect(() => {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img || !nat) return;
    c.width = nat.w; c.height = nat.h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    for (const s of draft ? [...shapes, draft] : shapes) drawAnno(ctx, s, lw);
  }, [shapes, draft, nat, lw]);

  function pos(e: ReactPointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e: ReactPointerEvent) {
    const { x, y } = pos(e);
    if (tool === "text") {
      commitText(); // commit any open label first
      setTextEdit({ cx: x, cy: y, left: e.clientX, top: e.clientY });
      setTextVal("");
      return;
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    setDraft(tool === "pen" ? { t: "pen", pts: [[x, y]], c: color } : { t: tool, x1: x, y1: y, x2: x, y2: y, c: color });
  }
  function move(e: ReactPointerEvent) {
    if (!draft) return;
    const { x, y } = pos(e);
    setDraft(draft.t === "pen" ? { ...draft, pts: [...draft.pts, [x, y]] } : { ...draft, x2: x, y2: y });
  }
  function up() {
    if (draft) { setShapes((s) => [...s, draft]); setDraft(null); }
  }
  function commitText() {
    if (textEdit && textVal.trim()) {
      const label = { t: "text" as const, x: textEdit.cx, y: textEdit.cy, text: textVal.trim(), c: color };
      setShapes((s) => [...s, label]);
    }
    setTextEdit(null);
    setTextVal("");
  }
  function attach() {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img) return;
    // composite synchronously so a still-being-typed label is included too
    const pending: Anno[] = textEdit && textVal.trim() ? [{ t: "text", x: textEdit.cx, y: textEdit.cy, text: textVal.trim(), c: color }] : [];
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      for (const s of [...shapes, ...pending]) drawAnno(ctx, s, lw);
    }
    onDone(c.toDataURL("image/jpeg", 0.72));
  }

  const tools: [typeof tool, string][] = [["rect", "▭"], ["arrow", "↗"], ["pen", "✎"], ["text", "T"]];
  return (
    <div className="fb-anno-overlay">
      <div className="fb-anno-bar" onPointerDown={(e) => e.stopPropagation()}>
        {tools.map(([t, icon]) => (
          <button key={t} type="button" className={`fb-btn fb-anno-tool ${tool === t ? "active" : ""}`} onClick={() => setTool(t)} title={t}>{icon}</button>
        ))}
        <span className="fb-anno-div" />
        {ANNO_COLORS.map((c) => (
          <button key={c} type="button" className={`fb-anno-sw ${color === c ? "active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`color ${c}`} />
        ))}
        <span className="fb-anno-div" />
        <button type="button" className="fb-btn" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>Undo</button>
        <button type="button" className="fb-btn" onClick={() => setShapes([])} disabled={!shapes.length}>Clear</button>
      </div>
      <canvas ref={canvasRef} className="fb-anno-canvas" style={{ cursor: tool === "text" ? "text" : "crosshair" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} />
      {textEdit && (
        <input
          className="fb-anno-text-input" autoFocus value={textVal}
          style={{ left: textEdit.left, top: textEdit.top, color, borderColor: color }}
          placeholder="label, then Enter"
          onChange={(e) => setTextVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitText(); }
            else if (e.key === "Escape") { setTextEdit(null); setTextVal(""); }
          }}
        />
      )}
      <div className="fb-anno-bar">
        <button type="button" className="fb-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="fb-btn fb-btn-primary" onClick={attach}>Attach</button>
      </div>
    </div>
  );
}
