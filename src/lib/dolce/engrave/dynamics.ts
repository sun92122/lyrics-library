// 力度记号（mf、sfz…）→ Bravura 字形串：三引擎共用一份（不碰 DOM，文本谱的语法表与 CLI 也 import）。
// 逐字母拼单字母力度字形（`mf` = mezzo + forte，同原排版程序 loader.cpp::convertDynamicsStr），
// 所以 `sffz`、`rfz`、`pppp` 这类不在常用表里的组合也画得出来。
import { GlyphCodes } from "../smufl/smufl";

const LETTER: Readonly<Record<string, string>> = {
  p: GlyphCodes.dynamicPiano,
  m: GlyphCodes.dynamicMezzo,
  f: GlyphCodes.dynamicForte,
  r: GlyphCodes.dynamicRinforzando,
  s: GlyphCodes.dynamicSforzando,
  z: GlyphCodes.dynamicZ,
  n: GlyphCodes.dynamicNiente,
};

/** 力度字形的字号 ÷ 简谱数字字号。Bravura 的力度字形很矮（`m` 的墨迹约 0.25 em），
 *  按数字字号排只有数字一半高、看着太小；1.4 时小写部分约为数字墨迹高的一半。简谱两条路（旧简谱引擎、原样文档）同用。 */
export const DYNAMIC_SIZE = 1.4;

/** 力度名 → 字形串；有认不出的字母（不是力度名）返回 ""。 */
export function dynamicGlyphs(name: string): string {
  let res = "";
  for (const c of name) {
    const g = LETTER[c];
    if (g === undefined) return "";
    res += g;
  }
  return res;
}
