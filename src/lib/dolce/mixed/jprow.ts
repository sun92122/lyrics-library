// 混排简谱层一个数字的竖向落点（主音与倚音），画（`jianpuoverlay.ts`）与量高（`model.ts::calcMixedStaffY`）共用。
// 坐标系是简谱层自己的：谱表顶 y = 0、数字基线在 `mixFont.size` 处。只 import 类型，不与 model.ts 成环。
import { stackBottom, stackTop, type StackStyle } from "../engrave/stack";
import type { ChordLayout, MixedOptions, NoteLayout, PartMeasureLayout } from "./model";

/** 简谱层一个数字的竖向落点：基线、缩放、「1」的墨迹顶底，以及它那一摞的取尺（engrave/stack.ts）。 */
export interface JpRow {
  y: number;
  scale: number;
  inkTop: number;
  inkBottom: number;
  st: StackStyle;
}

export function melodyNote(ch: ChordLayout): NoteLayout {
  return ch.notes.find((n) => n.jpMelody) ?? ch.notes[0]!;
}

/** 主音这一行：数字基线在 `字号` 处（谱表顶 y = 0），叠层的空 = `stackGap` × 数字墨迹高。 */
export function mainRow(eng: MixedOptions): JpRow {
  const font = eng.mixFont;
  const b = font.charBound("1");
  const d = font.charBound(".");
  const y = font.size;
  return {
    y,
    scale: 1,
    inkTop: y + b.top,
    inkBottom: y + b.bottom,
    st: { gap: eng.stackGap * b.height, dotRadius: (d.bottom - d.top) / 2, beamWidth: eng.lineWidths.jpBeam },
  };
}

/**
 * 倚音这一行：整体按 `jpGraceScale` 缩小（点、线、空一起缩），**整块**（数字、减时线、低音点；钩子不算，
 * 它本来就垂到主音身旁）的墨迹底离它所倚的主音那一摞的顶一道空——与旧简谱引擎、原样文档同一条规则。
 * 同一串倚音取最深的那颗定块高，几颗的数字才在一条线上。
 */
export function graceRow(eng: MixedOptions, md: PartMeasureLayout, ch: ChordLayout): JpRow {
  const main = mainRow(eng);
  const sc = eng.jpGraceScale;
  const st: StackStyle = { gap: main.st.gap * sc, dotRadius: main.st.dotRadius * sc, beamWidth: main.st.beamWidth * sc };
  const H = (main.inkBottom - main.inkTop) * sc;
  const idx = md.chords.indexOf(ch);
  let i0 = idx;
  while (i0 > 0 && md.chords[i0 - 1]!.grace) i0--;
  let i1 = idx;
  while (i1 < md.chords.length && md.chords[i1]!.grace) i1++;
  let below = 0;
  for (const g of md.chords.slice(i0, i1)) {
    below = Math.max(below, stackBottom(0, g.jpBeamCount(), Math.max(0, -melodyNote(g).octaveJp()), st));
  }
  const host = md.chords[i1];
  const mainTop = stackTop(main.inkTop, host ? melodyNote(host).octaveJp() : 0, main.st);
  const inkBottom = mainTop - main.st.gap - below;
  const b = eng.mixFont.charBound("1");
  return { y: inkBottom - b.bottom * sc, scale: sc, inkTop: inkBottom - H, inkBottom, st };
}


/** 一颗倚音连同它的高音点的墨迹顶（简谱层坐标）。 */
export function graceBlockTop(eng: MixedOptions, md: PartMeasureLayout, ch: ChordLayout): number {
  const row = graceRow(eng, md, ch);
  return stackTop(row.inkTop, Math.max(0, melodyNote(ch).octaveJp()), row.st);
}
