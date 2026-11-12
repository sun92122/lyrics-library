// 附点（延长一半时值的点）：旧简谱引擎、原样文档、混排简谱层共用一个落点规则。
//
// 实心矢量圆（engrave/dot.ts）。按**数字墨迹盒**定位：
//   - 竖向：圆心与数字墨迹中心等高（用户口径）；
//   - 横向：第一个点的墨迹左缘离数字墨迹右缘一道空，之后每个点之间也是一道空——
//     与数字上下那一摞同一个空（`stack-gap`，engrave/stack.ts），附点与八度点看着一样疏密。
// 原先三路三种：旧简谱引擎居中在「墨迹右缘 → 格位右缘」之间、原样文档离锚点固定 12.35、
// 混排照 render.cpp 的 `(advance/2 + 10) × 0.75`（出厂时点压进数字墨迹里一截）。
import type { Rect } from "../common/geom";

/** 第 `i` 个附点的圆心。`digit` 是数字墨迹盒（调用方坐标），`gap` 已乘好数字墨迹高。 */
export function augDotCenter(digit: Rect, i: number, r: number, gap: number): { cx: number; cy: number } {
  return { cx: digit.right + gap + r + i * (2 * r + gap), cy: (digit.top + digit.bottom) / 2 };
}

/** `n` 个附点伸出数字墨迹右缘多远（到最后一个点的墨迹右缘）。 */
export function augDotsReach(n: number, r: number, gap: number): number {
  return n > 0 ? n * (gap + 2 * r) : 0;
}
