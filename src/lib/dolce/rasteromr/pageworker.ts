// 浏览器版的页 Worker：多页并行识别的 Worker 一侧（`pagepool.ts::servePageWorker`）。由 `browser.ts` 起。
import { servePageWorker, type FromWorker, type ToWorker } from "./pagepool";

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
const handle = servePageWorker((msg) => scope.postMessage(msg));
scope.onmessage = (e) => handle(e.data);
