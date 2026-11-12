// 多连音的时值：组内各音的 `duration.timeMod` 一律按 `tuplet` Mark 补，各解析端（123 / ABC / 文本谱）收尾时都调这一份，
// 不各写各的——文本谱以前只记了 Mark、没写 `timeMod`，节拍自检（`beatcheck.ts`）照名义时值算，
// 同一首识别稿 123 报 1 处、文本谱报 4 处（青年诗歌 21 三个带三连音的小节各多 1/4 拍）。
//
// 组内**所有**占时值的元素（音符、休止）都按比例折算，倚音不算；多连音嵌套时比例相乘。

import type { Element, Mark } from "./doc";

/** 默认比例：n 连音占不大于 n 的最大 2 的幂（3→2、5/6/7→4）；二连音、四连音占 3（复拍子里用）。同 123 §4.1 */
export function defaultTupletNormal(actual: number): number {
  if (actual === 2 || actual === 4) return 3;
  return Math.pow(2, Math.floor(Math.log2(Math.max(1, actual - 1))));
}

/**
 * 按 `marks` 里的 tuplet 给 `seq`（同一声部流里按谱面先后排的元素）中组内各音写 `timeMod`。
 * 只认起止都落在 `seq` 里的组。`ratio` 定一组的比例：缺省取 Mark 上写的显示数字，没写按组内音数 n、`defaultTupletNormal`。
 */
export function applyTupletTimeMods(
  marks: readonly Mark[], seq: readonly Element[],
  ratio: (mk: Mark, n: number) => { actual: number; normal: number } = (mk, n) => {
    const actual = mk.tupletActual ?? n;
    return { actual, normal: mk.tupletNormal ?? defaultTupletNormal(actual) };
  },
): void {
  const pos = new Map<number, number>();
  seq.forEach((el, i) => pos.set(el.id, i));
  const timed = (el: Element): boolean => el.kind === "chord" && !el.grace && !!el.duration;
  const acc = new Map<number, { actual: number; normal: number }>();
  for (const mk of marks) {
    if (mk.type !== "tuplet" || mk.collapsed) continue;
    const s = pos.get(mk.start), e = pos.get(mk.end);
    if (s === undefined || e === undefined || e < s) continue;
    // 同一小节里别的声部（ABC `&` 分支）排在本声部之后，跨小节的组切片会夹进来：只认与起点同声部的
    const voice = seq[s]!.voice;
    const members = seq.slice(s, e + 1).filter((el) => timed(el) && el.voice === voice);
    if (!members.length) continue;
    const r = ratio(mk, members.length);
    for (const el of members) {
      const a = acc.get(el.id) ?? { actual: 1, normal: 1 };
      acc.set(el.id, { actual: a.actual * r.actual, normal: a.normal * r.normal });
    }
  }
  for (const el of seq) {
    const r = acc.get(el.id);
    if (r && el.kind === "chord") el.duration.timeMod = { ...el.duration.timeMod, actual: r.actual, normal: r.normal };
  }
}
