// 减时线按拍成组的**拍位判据**：三引擎共用一份（旧简谱引擎 `layout.ts::beamGroupsOf`、原样文档 `place/voice.ts::beatGroups`、
// 混排 `mixed/model.ts::processJpBeam`，源头是 musicpp `MusicData::processJpBeam`）。
//
// 谁进组（时值、减时线条数、`~` `^` 强制连断、跨行续段）各引擎自己定；这里只管「这个音落在第几拍组」：
//   - 组长（四分音符为 1）：复拍子（分母 8、分子是 3 的倍数：3/8 6/8 9/8 12/8）三个八分一组 = 1.5，其余一拍一组；
//   - **残节**（弱起、被反复切开的半个小节）按小节**末尾**对齐：拍位整体加上「整小节时值 − 本小节时值」，
//     组界才落在谱面该断的地方。两条例外：整曲末小节不补；下一小节的时值正好等于要补的那一截（首尾配对的两个残节）不补。
// 纯算术，不碰 DOM。

/** 一个拍组多长（四分音符为 1）。 */
export function beatGroupSize(beats: number, beatType: number): number {
  return beatType === 8 && beats % 3 === 0 ? 1.5 : 1;
}

/**
 * 残节该补的拍位偏移（四分音符为 1）。`expect` 是拍号的整小节时值，`actual` 是本小节实际时值；
 * `isLast` 是整曲末小节，`nextActual` 是下一小节的实际时值（没有就不传）。不补返回 0。
 */
export function pickupOffset(expect: number, actual: number, isLast: boolean, nextActual?: number): number {
  if (isLast) return 0;
  const skip = expect - actual;
  if (skip <= 1e-9) return 0;
  if (nextActual !== undefined && Math.abs(nextActual - skip) < 1e-9) return 0;
  return skip;
}

/** 小节内拍位 `pos`（四分音符为 1）落在第几拍组。 */
export function beatGroupIndex(pos: number, offset: number, size: number): number {
  return Math.floor((offset + pos) / size + 1e-9);
}
