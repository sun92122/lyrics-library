// .jpwabc encoding helpers. JP-Word writes UTF-16LE; we read BOM-aware and
// write UTF-16LE with a BOM for unambiguous round-tripping.

// 编解码挪到无依赖的 common/jpwcodec.ts（Node 端也用），这里照旧导出
export { decodeJpwabc, encodeJpwabc } from "../common/jpwcodec";

export function isTauriRuntime(): boolean {
  return false;
}

/** 落盘：浏览器走 a[download]。返回 null。 */
export async function saveBytes(
  bytes: Uint8Array,
  defaultName: string,
  mime = "application/octet-stream",
): Promise<string | null> {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: mime });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = defaultName;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}

