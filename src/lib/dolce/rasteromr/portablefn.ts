// **可跨线程重建的函数**：页结果里有几个字段是闭包（`Staff.lineYsAt`、`SPage.inkTextSize`），结构化克隆传不过去。
// 造它们时经 `definePortable` 登记「类型名 + 参数」，打包页结果（`pagetransfer.ts`）时换成这份描述、到另一边按类型名重造。
// 参数本身要能结构化克隆（普通对象、类型化数组）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...a: any[]) => any;

export interface PortableDesc {
  kind: string;
  args: unknown[];
}

const builders = new Map<string, AnyFn>();
const made = new WeakMap<AnyFn, PortableDesc>();

/** 登记一种可重建的函数：返回的工厂造出的函数都记得自己的类型名与参数。 */
export function definePortable<A extends unknown[], F extends AnyFn>(kind: string, build: (...a: A) => F): (...a: A) => F {
  builders.set(kind, build as AnyFn);
  return (...a: A) => {
    const f = build(...a);
    made.set(f, { kind, args: a });
    return f;
  };
}

/** 函数的描述（不是 `definePortable` 造的回 undefined）。 */
export function portableOf(f: AnyFn): PortableDesc | undefined {
  return made.get(f);
}

/** 按描述重造（造出的函数照样记下描述，可再传）。 */
export function rebuildPortable(d: PortableDesc): AnyFn {
  const b = builders.get(d.kind);
  if (!b) throw new Error(`没有登记的可重建函数：${d.kind}`);
  const f = b(...d.args);
  made.set(f, d);
  return f;
}
