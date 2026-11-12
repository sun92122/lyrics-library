// 工具栏、顶栏的弹出层：点开关钮在它下方展开，点外面、按 Esc、点了里面的按钮就收起。

export interface PopoverOptions {
  /** 面板里没有可见的 `[data-context-control]` 时把开关钮藏起来。 */
  autoHide?: boolean;
}

export function setupPopover(toggle: HTMLButtonElement, panel: HTMLElement, opts: PopoverOptions = {}): () => void {
  const abort = new AbortController();
  const isOpen = () => panel.classList.contains("open");
  const place = () => {
    const r = toggle.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    panel.style.top = `${r.bottom + 4}px`;
  };
  const close = () => {
    if (!isOpen()) return;
    panel.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    panel.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    place();
  };
  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (isOpen()) close();
    else open();
  }, { signal: abort.signal });
  // 点了里面的按钮（动作已经交给它自己的监听）就收起；下拉框要留着让人选
  panel.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("button")) close();
  }, { signal: abort.signal });
  panel.addEventListener("change", close, { signal: abort.signal });
  document.addEventListener("pointerdown", (ev) => {
    const t = ev.target as Node;
    if (isOpen() && !panel.contains(t) && !toggle.contains(t)) close();
  }, { signal: abort.signal });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  }, { signal: abort.signal });
  window.addEventListener("resize", close, { signal: abort.signal });
  let mo: MutationObserver | null = null;
  if (opts.autoHide) {
    const sync = () => {
      const any = !!panel.querySelector("[data-context-control]:not([hidden])");
      toggle.hidden = !any;
      if (!any) close();
    };
    mo = new MutationObserver(sync);
    mo.observe(panel, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    sync();
  }
  return () => {
    close();
    abort.abort();
    mo?.disconnect();
  };
}
