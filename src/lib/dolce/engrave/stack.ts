// 简谱数字上下那一摞（高音点 / 减时线 / 低音点，倚音里的同样几样）的竖向落点：三引擎共用。
//
// 口径（用户定）：**墨迹到墨迹等距**，一道空 `gap` 管到底——
//   上：数字墨迹顶 →gap→ 高音点 1 →gap→ 高音点 2 …
//   下：数字墨迹底 →gap→ 减时线 1 →gap→ 减时线 2 … →gap→ 低音点 1 →gap→ 低音点 2 …
// 点的大小、线的粗细各是各的参数，相邻两件之间的空一律是 `gap`。
// `gap` 按**数字墨迹高 H 的比例**给（样式键 `stack-gap`，缺省 0.17），所以混排里缩小的简谱层自己跟着缩。
// 纯算术、不碰 DOM：原样文档的定位（`place/`）也直接调。

/** `stack-gap` 的缺省值（÷ 数字墨迹高）。 */
export const STACK_GAP_DEFAULT = 0.17;

export interface StackStyle {
  /** 相邻两件墨迹之间的空（已乘好 H）。 */
  gap: number;
  /** 八度点半径。 */
  dotRadius: number;
  /** 减时线线宽。 */
  beamWidth: number;
}

/** 第 `i` 个高音点（0 = 离数字最近）的圆心 y。`inkTop` 是数字墨迹顶（y 向下为正）。 */
export function highDotY(inkTop: number, i: number, s: StackStyle): number {
  return inkTop - s.gap - s.dotRadius - i * (2 * s.dotRadius + s.gap);
}

/** 第 `level` 层减时线（1 起）的**线心** y。`inkBottom` 是数字墨迹底。 */
export function beamY(inkBottom: number, level: number, s: StackStyle): number {
  return inkBottom + s.gap + s.beamWidth / 2 + (level - 1) * (s.beamWidth + s.gap);
}

/** `n` 层减时线最下一层的墨迹底；没有减时线就是数字墨迹底。 */
export function beamsBottom(inkBottom: number, n: number, s: StackStyle): number {
  return n > 0 ? inkBottom + n * (s.gap + s.beamWidth) : inkBottom;
}

/** 第 `i` 个低音点（0 = 离数字最近）的圆心 y，挂在 `beams` 层减时线之下。 */
export function lowDotY(inkBottom: number, beams: number, i: number, s: StackStyle): number {
  return beamsBottom(inkBottom, beams, s) + s.gap + s.dotRadius + i * (2 * s.dotRadius + s.gap);
}

/** `oct` 个高音点之后这一摞的墨迹顶（没有高音点就是数字墨迹顶）。 */
export function stackTop(inkTop: number, oct: number, s: StackStyle): number {
  return oct > 0 ? highDotY(inkTop, oct - 1, s) - s.dotRadius : inkTop;
}

/** 减时线 + 低音点之后这一摞的墨迹底。 */
export function stackBottom(inkBottom: number, beams: number, lowDots: number, s: StackStyle): number {
  return lowDots > 0 ? lowDotY(inkBottom, beams, lowDots - 1, s) + s.dotRadius : beamsBottom(inkBottom, beams, s);
}
