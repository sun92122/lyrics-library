// 位图上一行字的字高：在二值图上量文字框里墨迹的上下沿。OCR 的检测框带留白（页眉小字的框高能有字高的两倍），
// 不能直接当字高；歌词那边按格量（`lyric.ts` 的 `charH`），这里给页眉、文字指示、和弦用。
//
// 口径与歌词的 `charH` 一致——**汉字墨迹高**：`SPage.textEm` 再折成字号。整行没有汉字的按字母的上下伸展折成汉字当量。
import type { Binary, Rect } from "../omrkit/types";

/** 汉字墨迹约占字号的这么多（`SPage.textEm` 是它的倒数）：位图路记的字高都是这个口径，折字号时再除 */
export const TEXT_INK_EM = 0.85;
const CJK_INK = TEXT_INK_EM;
/** 拉丁字母墨迹占字号：x 高约 0.5，有大写 / 升部（数字同）到 0.72，有下伸部再加 0.21 */
const LATIN_X = 0.5;
const LATIN_ASC = 0.72;
const LATIN_DESC = 0.21;
/** 一行里墨迹占到框宽这么多的行当成线（谱线、加线、松叶的横笔压进框里），不算字 */
const LINE_ROW = 0.7;
/** 字里的空行（「三」笔画之间、「i」的点下）不过这么多像素仍算同一段 */
const ROW_GAP = 2;

/** 框里文字的墨迹高（汉字当量，像素）。框里没有墨迹返回 0 */
export function inkTextSize(bin: Binary, box: Rect, text: string): number {
  const x0 = Math.max(0, Math.round(box.x)), x1 = Math.min(bin.w, Math.round(box.x + box.w));
  const y0 = Math.max(0, Math.round(box.y)), y1 = Math.min(bin.h, Math.round(box.y + box.h));
  const w = x1 - x0;
  if (w <= 0 || y1 <= y0) return 0;
  // 最长的一段有墨的行（中间空不过 `ROW_GAP` 行）
  let best = 0, start = -1, last = -1;
  for (let y = y0; y < y1; y++) {
    let n = 0;
    const row = y * bin.w;
    for (let x = x0; x < x1; x++) n += bin.data[row + x]!;
    if (n === 0 || n > w * LINE_ROW) continue;
    if (start < 0 || y - last > ROW_GAP + 1) start = y;
    last = y;
    best = Math.max(best, last - start + 1);
  }
  if (/[\u3400-\u9fff]/.test(text)) return best;
  // 整行没有汉字：按有没有大写 / 升部、下伸部定墨迹占字号多少，折成汉字当量
  const frac = (/[A-Z0-9bdfhklt]/.test(text) ? LATIN_ASC : LATIN_X) + (/[gjpqy]/.test(text) ? LATIN_DESC : 0);
  return (best * CJK_INK) / frac;
}

/** 小型大写：词首那个大写字母比同词其余字母高出这么多倍以上、其余字母彼此高差不过这么多 */
const SMALL_CAP_RATIO = 1.12;
const SMALL_CAP_SPREAD = 0.12;

/**
 * **小型大写字母**（破碎扫描版页眉「BROKEN」：B 是大写高，ROKEN 是小一号的大写）：OCR 读成全大写，按大写字母高折出的字号排出来
 * 整词都是大写高，比原谱大一圈。字号表达不了小型大写，认成「首字母大写、其余小写」（干净版文字层给的就是「Broken」），
 * 字号仍按首字母的大写高折——小写的 x 高与小型大写的高相近。
 *
 * 逐字按列投影切（字间有空列），切出的块数要与字母数对上才判；对不上原样返回。
 */
export function smallCapsCase(bin: Binary, box: Rect, text: string): string {
  if (!/[A-Z]{3,}/.test(text) || /[a-z]/.test(text)) return text;
  const x0 = Math.max(0, Math.round(box.x)), x1 = Math.min(bin.w, Math.round(box.x + box.w));
  const y0 = Math.max(0, Math.round(box.y)), y1 = Math.min(bin.h, Math.round(box.y + box.h));
  if (x1 <= x0 || y1 <= y0) return text;
  // 逐列的墨迹上下沿，有墨的列连成块
  const blobs: { top: number; bottom: number }[] = [];
  let cur: { top: number; bottom: number } | null = null;
  for (let x = x0; x < x1; x++) {
    let top = -1, bottom = -1;
    for (let y = y0; y < y1; y++) {
      if (!bin.data[y * bin.w + x]) continue;
      if (top < 0) top = y;
      bottom = y;
    }
    if (top < 0) {
      cur = null;
      continue;
    }
    if (!cur) blobs.push((cur = { top, bottom }));
    else (cur.top = Math.min(cur.top, top)), (cur.bottom = Math.max(cur.bottom, bottom));
  }
  const letters = [...text].filter((c) => /\S/.test(c));
  if (blobs.length !== letters.length || letters.some((c) => !/[A-Z]/.test(c))) return text;
  const hs = blobs.map((b) => b.bottom - b.top + 1);
  let k = 0;
  let changed = false;
  const words = text.split(/(\s+)/).map((w) => {
    if (!w.trim()) return w;
    const h = hs.slice(k, k + w.length);
    k += w.length;
    if (w.length < 2) return w;
    const rest = h.slice(1);
    const lo = Math.min(...rest), hi = Math.max(...rest);
    if (h[0]! < hi * SMALL_CAP_RATIO || hi - lo > hi * SMALL_CAP_SPREAD) return w;
    changed = true;
    return w[0] + w.slice(1).toLowerCase();
  });
  return changed ? words.join("") : text;
}
