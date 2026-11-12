// **页结果跨线程传**（多页并行，见 `pagepool.ts`）：`RasterPageResult` 是一张类实例图（`SPage`/`Staff`/`Seg`/`Sym`…），
// 结构化克隆保得住对象之间的引用、Map/Set 与类型化数组，保不住原型，也传不了函数。
//
// - 打包（Worker 那边，就地改，打完这一页就丢）：类实例记下类名（`CLS`），函数字段换成 `portablefn.ts` 登记过的描述（`FN`）。
//   **遇到没登记的类、没登记的函数直接抛错**——以后结果里加了新类，第一次跑就会发现，不会悄悄传丢原型。
// - 解包（主线程）：按类名接回原型、删掉标记，函数按描述重造。
//
// 新加进页结果的类要登记到 `CLASSES`。

import { Bar, Beam, Part, PObj, ScoreStaff, Seg, SlurTie, SPage, SSystem, Staff, Stem, Sym } from "../staffomr/model";
import { ContourLedger } from "./ledger";
import { portableOf, rebuildPortable, type PortableDesc } from "./portablefn";
import type { RasterPageResult } from "./recognize";

const CLS = "__omrCls";
const FN = "__omrFn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CLASSES: Record<string, { prototype: any }> = { Bar, Beam, Part, PObj, ScoreStaff, Seg, SlurTie, SPage, SSystem, Staff, Stem, Sym, ContourLedger };
const NAME_OF = new Map<object, string>(Object.entries(CLASSES).map(([k, c]) => [c.prototype as object, k]));

type Obj = Record<string, unknown>;

/** 遍历对象图（迭代，不递归）。`visit` 对每个对象（含数组、Map、Set）调一次；类型化数组与 ArrayBuffer 不进。 */
function walk(root: unknown, visit: (o: object) => void): void {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const o = stack.pop();
    if (o === null || typeof o !== "object" || seen.has(o)) continue;
    seen.add(o);
    if (ArrayBuffer.isView(o) || o instanceof ArrayBuffer) continue;
    visit(o);
    if (o instanceof Map) for (const [k, v] of o) stack.push(k, v);
    else if (o instanceof Set) for (const v of o) stack.push(v);
    else if (Array.isArray(o)) for (let i = 0; i < o.length; i++) stack.push(o[i]);
    else for (const k of Object.keys(o)) stack.push((o as Obj)[k]);
  }
}

/** 函数 → 描述；没登记的抛错。 */
function fnDesc(f: unknown, where: string): { [FN]: PortableDesc } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = portableOf(f as any);
  if (!d) throw new Error(`页结果里有传不过线程的函数（${where}）：要用 portablefn.ts::definePortable 造`);
  return { [FN]: d };
}

/** 就地打包一页结果，之后可以 `postMessage`。打包过的对象在这边不能再用。 */
export function packPageResult(r: RasterPageResult): RasterPageResult {
  walk(r, (o) => {
    if (o instanceof Map) {
      for (const [k, v] of o) if (typeof v === "function") o.set(k, fnDesc(v, "Map 值"));
      return;
    }
    if (o instanceof Set) return;
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) if (typeof o[i] === "function") o[i] = fnDesc(o[i], "数组元素");
      return;
    }
    const proto = Object.getPrototypeOf(o);
    if (proto !== Object.prototype && proto !== null) {
      const name = NAME_OF.get(proto);
      if (!name) throw new Error(`页结果里有没登记的类：${proto?.constructor?.name}（登记到 pagetransfer.ts 的 CLASSES）`);
      (o as Obj)[CLS] = name;
    }
    for (const k of Object.keys(o)) {
      const v = (o as Obj)[k];
      if (typeof v === "function") (o as Obj)[k] = fnDesc(v, `${proto?.constructor?.name ?? "Object"}.${k}`);
    }
  });
  return r;
}

const isFn = (v: unknown): v is { [FN]: PortableDesc } => v !== null && typeof v === "object" && FN in (v as object);

/** 就地解包（`packPageResult` 打的包经结构化克隆之后）：接回原型、重造函数。 */
export function unpackPageResult(r: RasterPageResult): RasterPageResult {
  walk(r, (o) => {
    if (o instanceof Map) {
      for (const [k, v] of o) if (isFn(v)) o.set(k, rebuildPortable(v[FN]));
      return;
    }
    if (o instanceof Set) return;
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) if (isFn(o[i])) o[i] = rebuildPortable((o[i] as { [FN]: PortableDesc })[FN]);
      return;
    }
    const rec = o as Obj;
    const name = rec[CLS];
    if (typeof name === "string") {
      const cls = CLASSES[name];
      if (!cls) throw new Error(`页结果里有不认识的类名：${name}`);
      delete rec[CLS];
      Object.setPrototypeOf(o, cls.prototype);
    }
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (isFn(v)) rec[k] = rebuildPortable(v[FN]);
    }
  });
  return r;
}
