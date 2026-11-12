// 状态栏的「核对」下拉：对着原图核对的几种方式合成一个选择——
//   不核对（只看排版稿）/ 并排原图 / 原图片段（这两种仍在可编辑的排版稿里）/ 附近浮窗 / 原位叠加 / 仅原图（后三种进核对视图）。

export interface CompareControls {
  body: HTMLElement | null;
  select: HTMLSelectElement;
  /** 整个下拉的外框（没有一项能用时藏起来） */
  field: HTMLElement;
  recognize: HTMLButtonElement;
  side: HTMLButtonElement;
  follow: HTMLButtonElement;
  view: HTMLSelectElement;
  /** 用户在下拉里选了一项（程序经 `apply` 选的不报） */
  onUserChange?(value: string): void;
}

/** 下拉的六个值 */
export const COMPARE_VALUES = ["none", "side", "follow", "floating", "inplace", "original"] as const;
export type CompareValue = (typeof COMPARE_VALUES)[number];

const OVERLAY = new Set(["floating", "inplace", "original"]);

export function setupCompareSelect(c: CompareControls): { apply(value: CompareValue): void; dispose(): void } {
  const abort = new AbortController();
  const body = c.body;
  const inProof = () => !!body?.classList.contains("recognize");
  const pressed = (b: HTMLButtonElement) => b.getAttribute("aria-pressed") === "true";
  const usable = (b: HTMLButtonElement) => !b.hidden;
  const option = (v: string) => c.select.querySelector<HTMLOptionElement>(`option[value="${v}"]`);

  const current = (): string => {
    if (inProof()) return c.view.value;
    if (pressed(c.side)) return "side";
    if (pressed(c.follow)) return "follow";
    return "none";
  };

  const sync = () => {
    const proof = usable(c.recognize);
    const side = usable(c.side);
    const follow = usable(c.follow);
    for (const v of OVERLAY) {
      const o = option(v);
      if (o) o.disabled = !proof;
    }
    const s = option("side");
    if (s) s.disabled = !side;
    const f = option("follow");
    if (f) f.disabled = !follow;
    const any = proof || side || follow;
    if (c.field.hidden === any) c.field.hidden = !any;
    const v = current();
    if (c.select.value !== v) c.select.value = v;
  };

  const choose = (v: string): void => {
    if (OVERLAY.has(v)) {
      if (c.view.value !== v) {
        c.view.value = v;
        c.view.dispatchEvent(new Event("change"));
      }
      if (!inProof()) c.recognize.click();
    } else {
      if (inProof()) c.recognize.click();
      // 并排与片段在排版稿里二选一（并排开着时片段小窗是多余的）
      if (pressed(c.side) !== (v === "side")) c.side.click();
      if (pressed(c.follow) !== (v === "follow")) c.follow.click();
    }
    sync();
  };

  c.select.addEventListener("change", () => {
    const v = c.select.value;
    choose(v);
    c.onUserChange?.(v);
  }, { signal: abort.signal });

  const watch = { attributes: true, attributeFilter: ["hidden", "aria-pressed"] };
  const mo = new MutationObserver(sync);
  for (const el of [c.recognize, c.side, c.follow]) mo.observe(el, watch);
  if (body) mo.observe(body, { attributes: true, attributeFilter: ["class"] });
  c.view.addEventListener("change", sync, { signal: abort.signal });
  sync();
  return {
    apply(value) {
      sync();
      const ok = (v: string) => !option(v)?.disabled;
      choose(ok(value) ? value : ok("side") ? "side" : "none");
    },
    dispose() {
      abort.abort();
      mo.disconnect();
    },
  };
}
