/** 指针锚定的滚轮 / 捏合缩放：排版区与并排原图栏共用。
 *  以触点为中心，缩放后让触点下的内容点保持在原屏幕位置。 */
export interface PinchZoomOptions {
  /** 当前缩放（绝对值） */
  get(): number;
  /** 设缩放（夹取由调用方做）；调完要同步生效，锚定紧接着读包围盒 */
  set(z: number): void;
  /** 锚点按页找：页内内容等比缩放，基于页自身的包围盒锚定，天然规避容器的居中/内边距偏移 */
  pages(): Iterable<Element>;
  /** 每帧应用完调（排版区刷百分比标签） */
  onChange?(): void;
  /** 触屏双指捏合（没有 WebKit gesture* 的浏览器）也接：两指距离比 × 起手时的缩放 */
  touch?: boolean;
}

export function attachPinchZoom(pane: HTMLElement, opts: PinchZoomOptions): () => void {
  const abort = new AbortController();
  const signal = abort.signal;
  let pendingZoom: number | null = null;
  let anchorX = 0, anchorY = 0;
  let rafId = 0;
  const anchorPage = (y: number): Element | null => {
    let best: Element | null = null;
    let bestDist = Infinity;
    for (const w of opts.pages()) {
      const rc = w.getBoundingClientRect();
      if (y >= rc.top && y <= rc.bottom) return w;
      const d = y < rc.top ? rc.top - y : y - rc.bottom;
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return best;
  };
  let gAnchor: { page: Element; fx: number; fy: number } | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const beginOrKeepAnchor = (clientX: number, clientY: number) => {
    if (!gAnchor) {
      const page = anchorPage(clientY);
      if (page) {
        const rc = page.getBoundingClientRect();
        gAnchor = { page, fx: (clientX - rc.left) / rc.width, fy: (clientY - rc.top) / rc.height };
      }
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { gAnchor = null; }, 250);
  };
  const flushZoom = () => {
    rafId = 0;
    if (pendingZoom === null) return;
    opts.set(pendingZoom);
    pendingZoom = null;
    if (gAnchor) {
      const post = gAnchor.page.getBoundingClientRect();
      const wantLeft = anchorX - gAnchor.fx * post.width;
      const wantTop = anchorY - gAnchor.fy * post.height;
      pane.scrollLeft += post.left - wantLeft;
      pane.scrollTop += post.top - wantTop;
    }
    opts.onChange?.();
  };
  const scheduleZoom = (target: number, clientX: number, clientY: number) => {
    pendingZoom = target;
    anchorX = clientX;
    anchorY = clientY;
    beginOrKeepAnchor(clientX, clientY);
    if (!rafId) rafId = requestAnimationFrame(flushZoom);
  };

  pane.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const base = pendingZoom ?? opts.get();
    scheduleZoom(base * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false, signal });

  let gestureBase = 1;
  type GEvt = Event & { scale: number; clientX: number; clientY: number };
  pane.addEventListener("gesturestart", (ev) => {
    const e = ev as GEvt;
    e.preventDefault();
    gestureBase = opts.get();
    gAnchor = null;
  }, { signal });
  pane.addEventListener("gesturechange", (ev) => {
    const e = ev as GEvt;
    e.preventDefault();
    scheduleZoom(gestureBase * e.scale, e.clientX, e.clientY);
  }, { signal });
  pane.addEventListener("gestureend", (ev) => ev.preventDefault(), { signal });

  if (opts.touch && !("ongesturestart" in window)) {
    let touchBase: { zoom: number; dist: number } | null = null;
    const spread = (t: TouchList) => {
      const a = t[0]!, b = t[1]!;
      return { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    };
    pane.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 2) return;
      touchBase = { zoom: opts.get(), dist: spread(e.touches).dist };
      gAnchor = null;
    }, { passive: true, signal });
    pane.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 2) return;
      if (!touchBase) {
        touchBase = { zoom: opts.get(), dist: spread(e.touches).dist };
        gAnchor = null;
      }
      if (touchBase.dist < 1) return;
      e.preventDefault();
      const s = spread(e.touches);
      scheduleZoom(touchBase.zoom * (s.dist / touchBase.dist), s.cx, s.cy);
    }, { passive: false, signal });
    pane.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) touchBase = null;
    }, { passive: true, signal });
  }

  return () => {
    abort.abort();
    clearTimeout(idleTimer);
    if (rafId) cancelAnimationFrame(rafId);
  };
}
