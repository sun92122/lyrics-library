// 谱面上的**内联文字输入框**：没有可见代码区的格式（`.musicxml`）双击歌词、标题时，就地弹一个输入框改字。
// 有代码区的格式照旧把焦点交给代码区（`VisualEditController.handleDoubleClick`），不走这里。
//
// 框贴在被点的那串字上（屏幕坐标、`position: fixed`），字号跟着字高走。按键全部留在框里（不冒泡到谱面，
// 否则数字键会被当成插音符）：Enter / Tab 提交并跳到下一个（歌词逐字往后填），Shift+Tab 往前，Esc 放弃，失焦提交。

export interface InlineDone {
  /** 新的文字；null = 放弃 */
  value: string | null;
  /** 提交后往哪边跳：1 下一个、-1 上一个、0 不跳 */
  nav: -1 | 0 | 1;
  /** 是按 `opts.keys` 里哪个键提交的（歌词录入的空格、连字符……）；Enter / Tab / 失焦为 undefined */
  tag?: string;
}

export interface InlineOptions {
  /** 另外哪些键提交（`ev.key` → 标签，交回 `InlineDone.tag`）。输入法组字时不认 */
  keys?: Readonly<Record<string, string>>;
}

let open: HTMLInputElement | null = null;

/** 正开着内联框（谱面键盘让给它）。 */
export function inlineEditing(): boolean {
  return open !== null;
}

export function closeInlineEditor(): void {
  open?.remove();
  open = null;
}

export function openInlineEditor(anchor: Element, value: string, onDone: (d: InlineDone) => void, placeholder = "", opts: InlineOptions = {}): void {
  open?.blur();
  const r = anchor.getBoundingClientRect();
  const input = document.createElement("input");
  input.type = "text";
  input.className = "dolce-scope vis-inline";
  input.value = value;
  if (placeholder) {
    input.placeholder = placeholder;
    input.title = placeholder;
  }
  const size = Math.max(12, Math.min(40, r.height * 0.8));
  Object.assign(input.style, {
    left: `${r.left - 4}px`,
    top: `${r.top + r.height / 2 - size * 0.8}px`,
    fontSize: `${size}px`,
    width: `${Math.max(r.width + size * 2, size * 4, placeholder ? placeholder.length * size * 0.9 : 0)}px`,
  });
  let finished = false;
  const finish = (d: InlineDone): void => {
    if (finished) return;
    finished = true;
    open = null;
    input.remove();
    onDone(d);
  };
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.isComposing || ev.keyCode === 229) return; // 中文输入法组字中：空格、回车是给输入法的
    const tag = opts.keys?.[ev.shiftKey && ev.key === " " ? "Shift+ " : ev.key];
    if (tag !== undefined) {
      ev.preventDefault();
      finish({ value: input.value, nav: tag.startsWith("prev") ? -1 : 1, tag });
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      finish({ value: null, nav: 0 });
    } else if (ev.key === "Enter" || ev.key === "Tab") {
      ev.preventDefault();
      finish({ value: input.value, nav: ev.shiftKey ? -1 : 1 });
    }
  });
  input.addEventListener("blur", () => finish({ value: input.value, nav: 0 }));
  document.body.appendChild(input);
  open = input;
  input.focus();
  input.select();
}
