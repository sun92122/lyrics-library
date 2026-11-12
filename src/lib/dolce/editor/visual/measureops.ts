// 可视化编辑的**小节操作**（文本格式那一路）：插入 / 追加 / 删除小节、换调号拍号速度、小节线样式、房号、跳转记号。
//
// 与 `ops.ts` 同一个做法：算出对原文的局部补丁。格式差异在方言的「小节写法表」（`EditDialect.measure`）——
// 123 与 ABC 同属 ABC 家族，小节线族 `|| |] |: :|`、房号 `[1`、跳转 `!D.C.!`、行内字段 `[K:…]` 写法一致，只差调号与休止怎么写。
// 没有这张表的格式（`.jpwabc`、文本谱）不做，状态栏请去源码改。`.musicxml` 走模型那一路（`modelops.ts`）。
//
// 小节在原文里没有对象：按方向键能停的条目（音符、增时线、小节线、换行）认——两条小节线之间、同一声部里的那一串就是一小节。
// 只改选区所在的那个声部（123 的多声部各写各的 `V:`，删 / 插小节要逐个声部改）。

import type { SyncEntry } from "../sync";
import type { EditCtx, EditOutcome } from "./ops";
import { noteCtx } from "./ops";
import { parseKeyInput, parseTempoInput, parseTimeInput } from "./measureinput";
import { t as tr } from "../../i18n";

export type TextBarKind = "single" | "double" | "final" | "repeatStart" | "repeatEnd";

/** 方言的小节写法表。 */
export interface MeasureSyntax {
  bars: Record<TextBarKind, string>;
  /** 前后都反复（`::`） */
  repeatBoth: string;
  volta(n: number): string;
  /** 跳转记号：segno / coda 写在小节头（左线之后），D.C. / D.S. / Fine 写在小节尾（右线之前） */
  jump: Record<"segno" | "coda" | "dc" | "ds" | "fine", string>;
  /** 行内字段 `[K:1=G]` */
  inline(field: "K" | "M" | "Q", value: string): string;
  /** 调号字段的值：123 `1=G`，ABC `G` */
  keyValue(fifths: number): string;
  tempoValue(bpm: number): string;
}

const nav = (c: EditCtx): SyncEntry[] => c.sync.ordered().filter((e) => e.kind === "note" || e.kind === "sustain" || e.kind === "barline" || e.kind === "break");
const isEdge = (e: SyncEntry | undefined): boolean => !e || e.kind === "barline" || e.kind === "break";

interface MeasureSpan {
  /** 小节内第一个、最后一个元素在 `list` 里的下标 */
  a: number;
  b: number;
  list: SyncEntry[];
  /** 小节开头（前一条小节线之后、跳过空白；连带挂在首音前面的记号） */
  start: number;
  /** 收尾那条小节线（没有为 null） */
  endBar: SyncEntry | null;
  /** 开头那条小节线（第一小节没有）：紧挨着的那一串里最后一条 */
  startBar: SyncEntry | null;
  /** 小节前面紧挨着的一串小节线条目（`|:` 后面跟房号 `[1` 时是两条），按原文顺序 */
  run: SyncEntry[];
}

/** 房号条目（`[1`、`[2`，123 / ABC 里它是一条小节线条目） */
const isVolta = (c: EditCtx, e: SyncEntry): boolean => /^\[\d/.test(c.state.doc.sliceString(e.from, e.to));

/** 选区（或光标前后）所在的那一小节；`last` 时取选区最后碰到的那一小节。 */
function measureAt(c: EditCtx, last = false): MeasureSpan | null {
  const list = nav(c);
  const sel = c.state.selection.main;
  let pivot = -1;
  if (sel.empty) {
    pivot = list.findIndex((e) => e.from >= sel.head);
    // 光标在小节线前面：那是前一小节的尾巴
    if (pivot < 0 || isEdge(list[pivot])) pivot = pivot < 0 ? list.length - 1 : pivot - 1;
    if (isEdge(list[pivot])) pivot++;
  } else {
    const hit = list.map((e, i) => ({ e, i })).filter(({ e }) => e.from < sel.to && e.to > sel.from && !isEdge(e));
    const pick = last ? hit[hit.length - 1] : hit[0];
    pivot = pick ? pick.i : list.findIndex((e) => e.from >= sel.from);
    if (isEdge(list[pivot])) pivot = last ? pivot - 1 : pivot + 1;
  }
  if (pivot < 0 || pivot >= list.length || isEdge(list[pivot])) return null;
  let a = pivot;
  while (!isEdge(list[a - 1])) a--;
  let b = pivot;
  while (!isEdge(list[b + 1])) b++;
  const startBar = list[a - 1]?.kind === "barline" ? list[a - 1]! : null;
  const run: SyncEntry[] = [];
  for (let k = a - 1; k >= 0 && list[k]!.kind === "barline"; k--) run.unshift(list[k]!);
  // 收尾线：紧跟着的那一串里第一条不是房号的（房号属于下一小节）
  const endBar = list[b + 1]?.kind === "barline" && !isVolta(c, list[b + 1]!) ? list[b + 1]! : null;
  const first = list[a]!;
  // 小节开头：上一条小节线之后（跳过空白）——房号 `[1`、行内字段、跳转记号都算这一小节的；第一小节没有线，取挂在首音前的记号起
  let start: number;
  if (startBar) {
    const text = c.state.doc.toString();
    start = startBar.to;
    while (start < first.from && /[ \t]/.test(text[start]!)) start++;
  } else {
    const marks = c.sync.marksOf(first.id).filter((m) => m.to <= first.from);
    start = Math.min(first.from, ...marks.map((m) => m.from));
  }
  return { a, b, list, start, endBar, startBar, run };
}

/** 这一处的拍号（模型里最近的 `M:`），换成整小节的休止串。 */
function restsFor(c: EditCtx, pos: number): string {
  const time = timeAt(c, pos);
  const beats = time?.beats ?? 4;
  const beatType = time?.beatType ?? 4;
  const nc = noteCtx(c, pos);
  if (beatType <= 4) {
    const quarters = Math.max(1, Math.round((beats * 4) / beatType));
    return Array.from({ length: quarters }, () => c.dialect.newNote(0, { halvings: 0, dots: 0 }, nc)).join(c.dialect.sep);
  }
  const h = Math.round(Math.log2(beatType / 4));
  return Array.from({ length: beats }, () => c.dialect.newNote(0, { halvings: h, dots: 0 }, nc)).join(c.dialect.sep);
}

function timeAt(c: EditCtx, pos: number): { beats: number; beatType: number } | undefined {
  let t = c.doc?.songs[0]?.time;
  let best = -1;
  for (const song of c.doc?.songs ?? []) {
    for (const part of song.parts) {
      let cur = song.time;
      for (const m of part.measures) {
        if (m.attrs?.time) cur = m.attrs.time;
        const off = m.elements[0]?.source?.offset;
        if (off !== undefined && off <= pos && off > best) {
          best = off;
          t = cur;
        }
      }
    }
  }
  return t;
}

const ok = (changes: { from: number; to: number; insert: string }[], at: number): EditOutcome => ({ changes, anchor: at, head: at });

/** 头部字段 `K:` / `M:` / `Q:` 的值区间（第一处；之后的是曲中转调）。 */
function headerValue(text: string, field: string): { from: number; to: number } | null {
  const m = new RegExp(`^${field}:[ \\t]*([^\\n\\r]*)`, "m").exec(text);
  if (!m) return null;
  const from = m.index + m[0].length - m[1]!.length;
  return { from, to: from + m[1]!.trimEnd().length };
}

/** 跑一个小节动作。`value` 是调号 / 拍号 / 速度输入框里的字（别的动作不用）。 */
export function measureEdit(c: EditCtx, id: string, value: string | null = null): EditOutcome {
  const syn = c.dialect.measure;
  if (!syn) return { error: tr("ve.measSrcOnly") };
  const doc = c.state.doc;
  const text = doc.toString();
  const sep = c.dialect.sep;
  if (id === "meas.append") {
    const list = nav(c);
    const lastBar = [...list].reverse().find((e) => e.kind === "barline");
    if (lastBar && lastBar === list[list.length - 1]) {
      const rests = restsFor(c, lastBar.from);
      return ok([{ from: lastBar.from, to: lastBar.from, insert: `${syn.bars.single}${sep}${rests}${sep}` }], lastBar.from + syn.bars.single.length + sep.length);
    }
    const tail = list[list.length - 1];
    if (!tail) return { error: tr("ve.noNotes") };
    const rests = restsFor(c, tail.to);
    return ok([{ from: tail.to, to: tail.to, insert: `${sep}${syn.bars.single}${sep}${rests}${sep}${syn.bars.single}` }], tail.to + 1);
  }
  const m = measureAt(c, id === "meas.delete" || id === "volta.1" || id === "volta.2");
  if (!m) return { error: tr("ve.selectInMeasure") };
  switch (id) {
    case "meas.insert": {
      // 插在这一小节开头那串小节线（`|: [1`）之前：新小节在反复、房号之外
      const lead = m.run[0];
      const rests = restsFor(c, m.start);
      if (lead) return ok([{ from: lead.from, to: lead.from, insert: `${syn.bars.single}${sep}${rests}${sep}` }], lead.from);
      return ok([{ from: m.start, to: m.start, insert: `${rests}${sep}${syn.bars.single}${sep}` }], m.start);
    }
    case "meas.delete": {
      const first = measureAt(c, false) ?? m;
      const to0 = m.endBar ? m.endBar.to : m.list[m.b]!.to;
      let to = to0;
      while (to < text.length && (text[to] === " " || text[to] === "\t")) to++;
      // 删的是最后一小节：它的收尾线（常是终止线）留给前一小节
      if (m.endBar && !m.list.slice(m.b + 2).some((e) => e.kind === "note") && first.startBar) {
        return ok([{ from: first.startBar.from, to: m.endBar.from, insert: "" }], first.startBar.from);
      }
      // 收尾线不是普通单线（`|:` `::` `||`…）时留着：它也是下一小节的开头
      // 本小节的房号一起删；收尾线不是普通单线（`|:` `::` `||`…）时留着：它也是下一小节的开头
      const volta = first.run.find((e) => isVolta(c, e));
      const from = volta ? volta.from : first.start;
      if (m.endBar && doc.sliceString(m.endBar.from, m.endBar.to) !== syn.bars.single) return ok([{ from, to: m.endBar.from, insert: "" }], from);
      return ok([{ from, to, insert: "" }], from);
    }
    case "meas.key":
    case "meas.time":
    case "meas.tempo": {
      const v = value ?? "";
      let field: "K" | "M" | "Q";
      let val: string;
      if (id === "meas.key") {
        const f = parseKeyInput(v);
        if (f === null) return { error: tr("ve.badKey", { v }) };
        field = "K";
        val = syn.keyValue(f);
      } else if (id === "meas.time") {
        const t = parseTimeInput(v);
        if (!t) return { error: tr("ve.badTime", { v }) };
        field = "M";
        val = `${t.beats}/${t.beatType}`;
      } else {
        const bpm = parseTempoInput(v);
        if (bpm === null) return { error: tr("ve.badTempo", { v }) };
        field = "Q";
        val = syn.tempoValue(bpm);
        if (bpm === 0) {
          // 去掉：小节头的行内 `[Q:…]`，第一小节就是头部的 `Q:` 行
          const head = text.slice(m.startBar ? m.startBar.to : m.start, m.list[m.a]!.from);
          const q = /\[Q:[^\]]*\]\s*/.exec(head);
          if (q) {
            const from = (m.startBar ? m.startBar.to : m.start) + q.index;
            return ok([{ from, to: from + q[0].length, insert: "" }], from);
          }
          const hv = !m.startBar ? headerValue(text, "Q") : null;
          if (hv) {
            const ls = doc.lineAt(hv.from);
            return ok([{ from: ls.from, to: Math.min(text.length, ls.to + 1), insert: "" }], ls.from);
          }
          return { error: tr("ve.noTempo") };
        }
      }
      // 第一小节：改头部字段（没有这个字段就在 `K:` 前面补一行；ABC 的 `K:` 必须是头部最后一行）
      if (!m.startBar && m.a === 0) {
        const hv = headerValue(text, field);
        if (hv) return ok([{ from: hv.from, to: hv.to, insert: val }], hv.from);
        const k = headerValue(text, "K");
        if (k) {
          const ls = doc.lineAt(k.from).from;
          return ok([{ from: ls, to: ls, insert: `${field}:${val}\n` }], ls);
        }
      }
      // 曲中：小节头写行内字段；已有同一个字段的换掉
      const re = new RegExp(`\\[${field}:[^\\]]*\\]`);
      const old = re.exec(text.slice(m.startBar ? m.startBar.to : m.start, m.list[m.a]!.from));
      if (old) {
        const from = (m.startBar ? m.startBar.to : m.start) + old.index;
        return ok([{ from, to: from + old[0].length, insert: syn.inline(field, val) }], from);
      }
      return ok([{ from: m.start, to: m.start, insert: `${syn.inline(field, val)}${sep}` }], m.start);
    }
    case "bar.single":
    case "bar.double":
    case "bar.final":
    case "bar.repeatEnd": {
      const kind = id.slice(4) as TextBarKind;
      let tok = syn.bars[kind];
      if (!m.endBar) {
        const tail = m.list[m.b]!;
        return ok([{ from: tail.to, to: tail.to, insert: `${sep}${tok}` }], tail.to + 1);
      }
      const cur = doc.sliceString(m.endBar.from, m.endBar.to);
      // 这条线同时是下一小节的反复开始：结束反复要写成前后都反复
      if (kind === "repeatEnd" && (cur === syn.bars.repeatStart || cur === syn.repeatBoth)) tok = syn.repeatBoth;
      return ok([{ from: m.endBar.from, to: m.endBar.to, insert: tok }], m.endBar.from);
    }
    case "bar.repeatStart": {
      const bar = m.run.find((e) => !isVolta(c, e));
      if (!bar) {
        const at = m.run[0] ? m.run[0].from : m.start;
        return ok([{ from: at, to: at, insert: `${syn.bars.repeatStart}${sep}` }], at);
      }
      const cur = doc.sliceString(bar.from, bar.to);
      const tok = cur === syn.bars.repeatEnd || cur === syn.repeatBoth ? syn.repeatBoth : syn.bars.repeatStart;
      return ok([{ from: bar.from, to: bar.to, insert: tok }], bar.from);
    }
    case "volta.1":
    case "volta.2": {
      const n = id === "volta.1" ? 1 : 2;
      const first = measureAt(c, false) ?? m;
      const tok = syn.volta(n);
      const old = first.run.find((e) => isVolta(c, e));
      if (old) {
        let to = old.to;
        while (text[to] === " ") to++;
        // 同号就去掉；别的号换成这一号
        if (doc.sliceString(old.from, old.to) === tok) return ok([{ from: old.from, to, insert: "" }], old.from);
        return ok([{ from: old.from, to: old.to, insert: tok }], old.from);
      }
      return ok([{ from: first.start, to: first.start, insert: `${tok}${sep}` }], first.start);
    }
    case "jump.segno":
    case "jump.coda":
    case "jump.dc":
    case "jump.ds":
    case "jump.fine": {
      const kind = id.slice(5) as keyof MeasureSyntax["jump"];
      const tok = syn.jump[kind];
      const atStart = kind === "segno" || kind === "coda";
      const zoneFrom = atStart ? (m.startBar ? m.startBar.to : m.start) : m.list[m.b]!.to;
      const zoneTo = atStart ? m.list[m.a]!.from : (m.endBar ? m.endBar.from : m.list[m.b]!.to);
      const zone = text.slice(zoneFrom, zoneTo);
      const at = zone.indexOf(tok);
      if (at >= 0) {
        let to = zoneFrom + at + tok.length;
        while (text[to] === " ") to++;
        return ok([{ from: zoneFrom + at, to, insert: "" }], zoneFrom + at);
      }
      if (atStart) return ok([{ from: m.start, to: m.start, insert: `${tok}${sep}` }], m.start);
      const pos = m.endBar ? m.endBar.from : m.list[m.b]!.to;
      const lead = pos > 0 && /\s/.test(text[pos - 1]!) ? "" : sep;
      return ok([{ from: pos, to: pos, insert: `${lead}${tok}${sep}` }], pos);
    }
  }
  return { error: tr("ve.measUnsupported") };
}

/** 123 与 ABC 共用的那部分（只差调号的值与休止的写法，休止由各自的 `newNote(0, …)` 给）。 */
export function abcFamilyMeasure(keyValue: (fifths: number) => string): MeasureSyntax {
  return {
    bars: { single: "|", double: "||", final: "|]", repeatStart: "|:", repeatEnd: ":|" },
    repeatBoth: "::",
    volta: (n) => `[${n}`,
    jump: { segno: "!segno!", coda: "!coda!", dc: "!D.C.!", ds: "!D.S.!", fine: "!fine!" },
    inline: (f, v) => `[${f}:${v}]`,
    keyValue,
    tempoValue: (bpm) => `1/4=${bpm}`,
  };
}
