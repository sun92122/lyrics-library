// 可视化编辑的**剪贴板**：复制 / 剪切 / 粘贴、`R` 重复选区。
//
// 两份东西一起记：原文那一段（贴回同一种格式时原样贴，注释、和弦名、装饰都在）和一串与格式无关的 `ClipItem`
// （音、增时线、小节线——贴到别的格式、或贴进 MusicXML 时按它重写）。系统剪贴板只放原文那段文字；
// 粘贴时系统剪贴板里的字与上次复制的相同才用 `ClipItem`，否则当作这种格式的原文直接贴。

import type { ClipItem } from "../../model/edit";
import type { EditDialect, NoteCtx } from "./dialect";

export interface Clip {
  /** 复制自哪种格式的方言（MusicXML 为 null）：与贴的地方相同才原样贴原文 */
  dialect: EditDialect | null;
  /** 原文那一段（MusicXML 复制的是空串：XML 片段贴出去没用） */
  text: string;
  items: ClipItem[];
}

let current: Clip | null = null;

export function setClip(c: Clip): void {
  current = c;
}

/** 系统剪贴板里是 `text` 时用哪份：与上次复制的对得上就是它，否则 null（外面拷来的字，当原文贴）。`text` 为 null = 没读系统剪贴板 */
export function clipFor(text: string | null): Clip | null {
  if (!current) return null;
  if (text === null || text === current.text || (current.text === "" && text === "")) return current;
  return null;
}

/** `ClipItem` 写成这种格式的一串 token（增时线写进 token 的格式并进前一个音）。 */
export function itemsToText(items: readonly ClipItem[], d: EditDialect, nc: NoteCtx): string {
  const toks: string[] = [];
  let pending: { t: Parameters<EditDialect["printNote"]>[0] } | null = null;
  const flush = (): void => {
    if (pending) toks.push(d.printNote(pending.t, nc));
    pending = null;
  };
  for (const it of items) {
    if (it.kind === "note") {
      flush();
      pending = { t: { acc: it.acc, degree: it.degree, octave: it.degree ? it.octave : 0, halvings: it.halvings, dots: it.dots, pre: "", post: "", inlineSustains: 0 } };
    } else if (it.kind === "sustain") {
      if (d.sustain === "inline") {
        if (pending) pending.t.inlineSustains += 1;
      } else {
        flush();
        toks.push("-");
      }
    } else {
      flush();
      toks.push(d.barline);
    }
  }
  flush();
  return toks.join(d.sep);
}
