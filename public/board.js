// Полотно: три слоя (подсказка, готовые штрихи, штрихи в процессе) в логических координатах 1600×1200.
export const W = 1600;
export const H = 1200;

function drawStroke(ctx, s, preview = false) {
  const pts = s.points;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  if (s.tool === 'eraser') {
    if (preview) { ctx.strokeStyle = 'rgba(200,200,200,.6)'; ctx.fillStyle = ctx.strokeStyle; }
    else { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; }
  } else {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
  }
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }
  ctx.restore();
}

export class Board {
  constructor(stage, { onLive, onEnd }) {
    this.stage = stage;
    this.onLive = onLive;
    this.onEnd = onEnd;
    this.guideCanvas = document.createElement('canvas');
    this.mainCanvas = document.createElement('canvas');
    this.liveCanvas = document.createElement('canvas');
    this.liveCanvas.className = 'top';
    stage.append(this.guideCanvas, this.mainCanvas, this.liveCanvas);
    this.strokes = []; // {id, userId, data, own}
    this.remote = new Map(); // sid -> stroke in progress
    this.current = null;
    this.color = '#2b2530';
    this.size = 6;
    this.tool = 'pen';
    this.locked = false;
    this.guide = null;
    this.showGuide = true;
    this.ownIds = [];
    this.bindPointer();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.stage.clientWidth * dpr));
    const hgt = Math.max(1, Math.round(this.stage.clientHeight * dpr));
    for (const c of [this.guideCanvas, this.mainCanvas, this.liveCanvas]) {
      c.width = w;
      c.height = hgt;
      c.getContext('2d').setTransform(w / W, 0, 0, hgt / H, 0, 0);
    }
    this.redraw();
    this.drawGuide();
  }

  clearCtx(c) {
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    return ctx;
  }

  redraw() {
    const ctx = this.clearCtx(this.mainCanvas);
    for (const s of this.strokes) drawStroke(ctx, s.data);
  }

  redrawLive() {
    const ctx = this.clearCtx(this.liveCanvas);
    for (const s of this.remote.values()) drawStroke(ctx, s, true);
    if (this.current) drawStroke(ctx, this.current, true);
  }

  scheduleLive() {
    if (this.liveQueued) return;
    this.liveQueued = true;
    requestAnimationFrame(() => { this.liveQueued = false; this.redrawLive(); });
  }

  setStrokes(list) {
    this.strokes = list.map((s) => ({ ...s }));
    this.remote.clear();
    this.redraw();
    this.redrawLive();
  }

  clear() {
    this.strokes = [];
    this.remote.clear();
    this.ownIds = [];
    this.redraw();
    this.redrawLive();
  }

  remove(id) {
    this.strokes = this.strokes.filter((s) => s.id !== id);
    this.ownIds = this.ownIds.filter((x) => x !== id);
    this.redraw();
  }

  lastOwnStrokeId() { return this.ownIds[this.ownIds.length - 1]; }

  remoteLive(m) {
    let s = this.remote.get(m.sid);
    if (!s) { s = { tool: m.tool, color: m.color, size: m.size, points: [] }; this.remote.set(m.sid, s); }
    s.points.push(...m.points);
    this.scheduleLive();
  }

  remoteAdd(m) {
    this.remote.delete(m.sid);
    this.strokes.push({ id: m.id, userId: m.userId, data: m.data });
    drawStroke(this.mainCanvas.getContext('2d'), m.data);
    this.scheduleLive();
  }

  setGuide(paths, step) {
    this.guide = { paths, step };
    this.drawGuide();
  }

  drawGuide() {
    const ctx = this.clearCtx(this.guideCanvas);
    if (!this.guide || !this.showGuide) return;
    const { paths, step } = this.guide;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paths.forEach((d, i) => {
      if (i > step) return;
      const p = new Path2D(d);
      if (i < step) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(120,110,130,.25)';
        ctx.lineWidth = 6;
      } else {
        ctx.setLineDash([18, 14]);
        ctx.strokeStyle = 'rgba(242,169,59,.9)';
        ctx.lineWidth = 8;
      }
      ctx.stroke(p);
    });
    ctx.restore();
  }

  toLogical(e) {
    const r = this.liveCanvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }

  bindPointer() {
    const el = this.liveCanvas;
    let sent = 0;
    let lastFlush = 0;
    const flush = (force) => {
      const now = performance.now();
      if (!this.current || (!force && now - lastFlush < 40)) return;
      lastFlush = now;
      const pts = this.current.points.slice(sent);
      if (!pts.length) return;
      sent = this.current.points.length;
      this.onLive({ sid: this.current.sid, tool: this.current.tool, color: this.current.color, size: this.current.size, points: pts });
    };
    el.addEventListener('pointerdown', (e) => {
      if (this.locked || e.button > 0) return;
      el.setPointerCapture(e.pointerId);
      sent = 0;
      this.current = {
        sid: Math.random().toString(36).slice(2),
        tool: this.tool, color: this.color, size: this.size, points: [this.toLogical(e)],
      };
      this.scheduleLive();
      flush(true);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.current) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) {
        const p = this.toLogical(ev);
        const last = this.current.points[this.current.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.5 && this.current.points.length < 4000) this.current.points.push(p);
      }
      this.scheduleLive();
      flush(false);
    });
    const finish = () => {
      if (!this.current) return;
      const s = this.current;
      this.current = null;
      const entry = { id: null, data: { tool: s.tool, color: s.color, size: s.size, points: s.points } };
      this.strokes.push(entry);
      drawStroke(this.mainCanvas.getContext('2d'), entry.data);
      this.scheduleLive();
      this.onEnd({ ...entry.data, sid: s.sid }, (id) => {
        if (id) { entry.id = id; this.ownIds.push(id); } else { this.strokes = this.strokes.filter((x) => x !== entry); this.redraw(); }
      });
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }

  download(name) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.mainCanvas, 0, 0, W, H);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = name;
    a.click();
  }
}
