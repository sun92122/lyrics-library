// 元素类共用的纯数值口径（不碰 DOM：成书的 Node 端 `pdflayout/bookparts.ts` 也 import）。

/** 「=」两侧各让的空 ÷ 字号：连写「1=F」「♩=120」挤成一团（用户口径），调号、转调、速度标记一律这么空。 */
export const EQ_PAD_EM = 0.2;

/** 调名与和弦根音/低音的升降号写在字母前（`♭B`、`#Fm`）还是后（`B♭`、`F#m`）。
 *  样式键 `accidental-side`，调号、转调、和弦同一个；不给 = 各自原来的写法（调号在前、和弦照原文）。 */
export type AccidentalSide = "before" | "after";

/** 临时记号的样子：`csym`（缺省，照混排：和弦那套小号字形、按数字墨迹盒定位）、
 *  `classic`（原先旧简谱引擎的样子：五线谱升降号字形 0.8 倍、挂在数字左上，成书照原书用它）。样式键 `accidental-style`。 */
export type AccidentalStyleKind = "csym" | "classic";
