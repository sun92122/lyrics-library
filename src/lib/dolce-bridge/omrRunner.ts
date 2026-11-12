import type { ElementId, ScoreDoc } from "../dolce/model/doc";
import type { PendingPage } from "../dolce/rasteromr/browser";
import type { StaffBarMark, StaffMark, StaffSourceMark } from "../dolce/rasteromr/overlay";
import type { StaffReviewResult } from "../dolce/staffomr/review";
import { isPdf } from "../dolce/omrkit/pdf";
import type { ScoreFormat } from "./runtime";

export interface OmrInputFile {
  bytes: Uint8Array;
  mime?: string;
  name?: string;
}

export type OmrDetectMode = "auto" | "jianpu" | "staff";

export interface OmrProgressInfo {
  phase: string;
  done?: number;
  total?: number;
}

export interface RunOmrOptions {
  mode?: OmrDetectMode;
  onProgress?: (info: OmrProgressInfo) => void;
  signal?: AbortSignal;
}

export interface OmrRunResult {
  sourceKind: "jianpu" | "staff" | "mixed";
  defaultView: "original" | "expanded" | "staff" | "mixed";
  format: ScoreFormat;
  content: string;
  beatIssues: number;
  doubtCount: number;
  pageCount: number;
  renderVerificationSvgs: (showOverlay: boolean) => SVGSVGElement[];
  renderOriginalPageUrls: () => Promise<string[]>;
  dispose: () => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("已取消樂譜辨識", "AbortError");
  }
}

function baseTitle(name?: string): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/\.[^.]+$/, "").trim();
  return cleaned || undefined;
}

function createOriginalsManager(files: readonly OmrInputFile[]) {
  const trackedUrls = new Set<string>();
  let disposed = false;
  let cachedPromise: Promise<string[]> | null = null;

  const trackUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (disposed) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      return null;
    }
    if (url.startsWith("blob:")) trackedUrls.add(url);
    return url;
  };

  const renderOriginalPageUrls = async (): Promise<string[]> => {
    if (disposed) return [];
    if (cachedPromise) return cachedPromise;

    cachedPromise = (async () => {
      const urls: string[] = [];
      let renderPdfPagesFn: ((bytes: Uint8Array) => Promise<PendingPage[]>) | null = null;

      for (const file of files) {
        if (disposed) break;
        if (isPdf(file.bytes, file.mime)) {
          if (!renderPdfPagesFn) {
            const rb = await import("../dolce/rasteromr/browser");
            renderPdfPagesFn = rb.renderPdfPages;
          }
          const pages = await renderPdfPagesFn(file.bytes);
          for (const page of pages) {
            const rendered = await page.rendered.catch(() => null);
            const url = trackUrl(rendered?.url);
            if (url) urls.push(url);
          }
        } else {
          const url = URL.createObjectURL(
            new Blob([file.bytes as BlobPart], file.mime ? { type: file.mime } : {}),
          );
          const kept = trackUrl(url);
          if (kept) urls.push(kept);
        }
      }
      return urls;
    })();

    return cachedPromise;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const url of trackedUrls) {
      URL.revokeObjectURL(url);
    }
    trackedUrls.clear();
  };

  return { renderOriginalPageUrls, dispose };
}

/**
 * Stitches multiple non-PDF images vertically onto a single white-background canvas
 * for multi-page jianpu OMR inputs.
 */
async function mergeJianpuInputIfMultiple(
  files: readonly OmrInputFile[],
): Promise<OmrInputFile> {
  const first = files[0]!;
  if (files.length <= 1 || files.some((f) => isPdf(f.bytes, f.mime))) {
    return first;
  }

  const bitmaps = await Promise.all(
    files.map((f) =>
      createImageBitmap(
        new Blob([f.bytes as BlobPart], f.mime ? { type: f.mime } : {}),
      ),
    ),
  );
  try {
    const width = Math.max(...bitmaps.map((b) => b.width));
    const totalHeight = bitmaps.reduce((acc, b) => acc + b.height, 0);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return first;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, totalHeight);
    let y = 0;
    for (const bmp of bitmaps) {
      ctx.drawImage(bmp, 0, y);
      y += bmp.height;
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return first;
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: "image/png",
      name: first.name,
    };
  } finally {
    for (const bmp of bitmaps) bmp.close();
  }
}

async function buildStaffResult(
  xml: string,
  overlay: StaffReviewResult | null,
  sourceKind: "staff" | "mixed",
  pageCount: number,
  files: readonly OmrInputFile[],
): Promise<OmrRunResult> {
  const [{ musicXmlFormat }, { checkMeasureDurations }, { renderStaffRecognitionPage }, { surfaceIds }] =
    await Promise.all([
      import("../dolce/editor/formats"),
      import("../dolce/model/beatcheck"),
      import("../dolce/rasteromr/overlay"),
      import("../dolce/editor/omrlinks"),
    ]);

  let parsedDoc: ScoreDoc | null = null;
  let beatIssues = 0;
  try {
    parsedDoc = musicXmlFormat.toScoreDoc(xml);
    beatIssues = checkMeasureDurations(parsedDoc).length;
  } catch {
    beatIssues = 0;
  }

  // Precompute barline measure associations so intact barlines are not rendered as deleted
  const barsByPage = new Map<number, StaffBarMark[]>();
  const othersByPage = new Map<number, StaffSourceMark[]>();

  if (overlay) {
    const measureOf = new Map<ElementId, number>();
    const chordOfOmr = new Map<string, ElementId>();
    for (const part of parsedDoc?.songs[0]?.parts ?? []) {
      part.measures.forEach((m, mi) => {
        for (const el of m.elements) {
          if (el.kind !== "chord") continue;
          measureOf.set(el.id, mi);
          for (const oid of surfaceIds(el)) {
            if (oid && overlay.noteBoxes.has(oid)) chordOfOmr.set(oid, el.id);
          }
        }
      });
    }

    const boxKey = (pg: number, b: { left: number; top: number }): string =>
      `${pg}:${Math.round(b.left)}:${Math.round(b.top)}`;
    const idAt = new Map<string, string>();
    for (const [id, b] of overlay.noteBoxes) {
      idAt.set(boxKey(b.page, b.box), id);
    }

    const measureOfSym = (
      pg: number,
      k: number,
      box: { left: number; top: number } | undefined,
    ): number | undefined => {
      if (!box) return undefined;
      const id =
        idAt.get(boxKey(pg, { left: box.left * k, top: box.top * k })) ??
        idAt.get(boxKey(pg, box));
      const ch = id ? chordOfOmr.get(id) : undefined;
      return ch !== undefined ? measureOf.get(ch) : undefined;
    };

    overlay.pages.forEach((pg, pageIndex) => {
      const k = pg.scale ?? 1;
      const pageBars: StaffBarMark[] = [];
      for (const st of pg.result.page.staves) {
        if (st.lineYs.length < 5) continue;
        const edge = (
          bar: (typeof st.bars)[number] | undefined,
          right: boolean,
        ): { left: number; top: number } | undefined =>
          bar?.notes.reduce<(typeof bar.notes)[number] | undefined>(
            (best, n) =>
              !best || (right ? n.box.left > best.box.left : n.box.left < best.box.left)
                ? n
                : best,
            undefined,
          )?.box;

        st.bars.forEach((bar, bi) => {
          const last = measureOfSym(pageIndex, k, edge(bar, true));
          if (last === undefined) return;
          const nextFirst = measureOfSym(pageIndex, k, edge(st.bars[bi + 1], false));
          pageBars.push({
            x: bar.right * k,
            top: st.lineYs[0]! * k,
            bottom: st.lineYs[4]! * k,
            measure: nextFirst !== undefined && nextFirst === last ? null : last,
          });
        });
      }
      barsByPage.set(pageIndex, pageBars);
    });

    for (const [id, b] of overlay.markBoxes ?? []) {
      const list = othersByPage.get(b.page) ?? [];
      list.push({ id, kind: b.kind, box: b.box });
      othersByPage.set(b.page, list);
    }
  }

  const pitchLabel = (step: string, alter: number, octave: number, rest: boolean): string =>
    rest ? "休" : `${step}${alter > 0 ? "♯".repeat(alter) : alter < 0 ? "♭".repeat(-alter) : ""}${octave}`;

  const renderVerificationSvgs = (showOverlay: boolean): SVGSVGElement[] => {
    if (!overlay) return [];
    const view = showOverlay ? "inplace" : "original";
    const svgs: SVGSVGElement[] = [];
    overlay.pages.forEach((pg, i) => {
      const bin = pg.result.raster?.bin;
      if (!bin) return;
      const marks: StaffMark[] = [...overlay.noteBoxes]
        .filter(([, b]) => b.page === i)
        .map(([id, b]) => ({
          id,
          box: b.box,
          label: pitchLabel(b.step, b.alter, b.octave, b.rest),
        }));
      const svg = renderStaffRecognitionPage(
        bin,
        marks,
        view,
        barsByPage.get(i) ?? [],
        othersByPage.get(i) ?? [],
      );
      svg.dataset.page = String(i);
      svgs.push(svg);
    });
    return svgs;
  };

  const originals = createOriginalsManager(files);

  return {
    sourceKind,
    defaultView: sourceKind === "mixed" ? "mixed" : "staff",
    format: "musicxml",
    content: xml,
    beatIssues,
    doubtCount: 0,
    pageCount: Math.max(1, pageCount, overlay?.pages.length ?? 0),
    renderVerificationSvgs,
    renderOriginalPageUrls: originals.renderOriginalPageUrls,
    dispose: originals.dispose,
  };
}

/**
 * Runs browser-side optical music recognition (OMR) across:
 * 1. Vector staff PDF (`staffomr/browser`)
 * 2. Outlined vector staff PDF with ONNX OCR (`outlineomr/browser`)
 * 3. Raster staff image/PDF with ONNX OCR (`rasteromr/browser`)
 * 4. Jianpu OMR image/PDF with ONNX OCR (`omr/recognize`)
 */
export async function runSheetOmr(
  files: readonly OmrInputFile[],
  opts: RunOmrOptions = {},
): Promise<OmrRunResult> {
  if (!files.length) {
    throw new Error("請先選擇或拖放樂譜圖檔或 PDF");
  }

  const mode = opts.mode ?? "auto";
  const signal = opts.signal;
  throwIfAborted(signal);

  const { installBrowserOmr } = await import("../dolce/omrkit/browser");
  installBrowserOmr();

  const first = files[0]!;
  const title = files.length === 1 ? baseTitle(first.name) : undefined;

  // 1 & 2. Vector / Outlined Staff PDF fast path
  if (files.length === 1 && mode !== "jianpu" && isPdf(first.bytes, first.mime)) {
    opts.onProgress?.({ phase: "檢查 PDF 樂譜結構…" });
    const sb = await import("../dolce/staffomr/browser");
    let pdfDoc: Awaited<ReturnType<typeof sb.openStaffPdf>> | null = null;
    try {
      pdfDoc = await sb.openStaffPdf(first.bytes);
    } catch {
      pdfDoc = null;
    }

    if (pdfDoc) {
      try {
        throwIfAborted(signal);
        const isVectorStaff = await sb.isStaffPdf(pdfDoc.pdf, pdfDoc.OPS).catch(() => false);
        if (isVectorStaff) {
          throwIfAborted(signal);
          opts.onProgress?.({ phase: "辨識矢量五線譜 PDF…" });
          const res = await sb.recognizeStaffPdf(pdfDoc, {
            ...(title ? { title } : {}),
            noteIds: true,
            onProgress: (done, total) =>
              opts.onProgress?.({ phase: "辨識矢量五線譜 PDF…", done, total }),
          });
          throwIfAborted(signal);
          if (res.notes > 0 && res.musicxml) {
            let overlay: StaffReviewResult | null = null;
            try {
              overlay = await sb.vectorOverlayResult(pdfDoc, res);
            } catch {
              overlay = null;
            }
            throwIfAborted(signal);
            return buildStaffResult(res.musicxml, overlay, "staff", res.pages, files);
          }
        } else {
          const ob = await import("../dolce/outlineomr/browser");
          const isOutlined = await ob
            .isOutlinedStaffPdf(pdfDoc.pdf, pdfDoc.OPS)
            .catch(() => false);
          if (isOutlined) {
            throwIfAborted(signal);
            opts.onProgress?.({ phase: "辨識轉曲矢量五線譜 PDF（離線 OCR）…" });
            const res = await ob.recognizeOutlinedPdf(pdfDoc, {
              ...(title ? { title } : {}),
              noteIds: true,
              onProgress: (done, total) =>
                opts.onProgress?.({ phase: "辨識轉曲五線譜 PDF…", done, total }),
            });
            throwIfAborted(signal);
            if (res.notes > 0 && res.musicxml) {
              let overlay: StaffReviewResult | null = null;
              try {
                overlay = await sb.vectorOverlayResult(pdfDoc, res);
              } catch {
                overlay = null;
              }
              throwIfAborted(signal);
              const hasJianpu = "jianpu" in res && Boolean(res.jianpu);
              return buildStaffResult(
                res.musicxml,
                overlay,
                hasJianpu ? "mixed" : "staff",
                res.pages,
                files,
              );
            }
          }
        }
      } finally {
        pdfDoc.pdf.destroy?.();
      }
    }
  }

  // 3. Raster Staff path (scanned PDF or bitmap images)
  if (mode !== "jianpu") {
    throwIfAborted(signal);
    opts.onProgress?.({ phase: "分析五線譜頁面版面…" });
    try {
      const rb = await import("../dolce/rasteromr/browser");
      const pdfs: Uint8Array[] = [];
      for (const f of files) {
        throwIfAborted(signal);
        pdfs.push(await rb.asRasterPdf(f.bytes, f.mime));
      }
      throwIfAborted(signal);

      const probe = mode === "staff" ? null : await rb.probeRasterStaff(pdfs[0]!);
      throwIfAborted(signal);

      if (!probe || probe.isStaff) {
        opts.onProgress?.({ phase: "執行五線譜與歌詞辨識（離線 ONNX）…" });
        const res = await rb.recognizeRasterPdfs(pdfs, {
          ...(title ? { title } : {}),
          firstPages: probe?.pages,
          cancelled: () => Boolean(signal?.aborted),
          onPage: (done, total) =>
            opts.onProgress?.({ phase: "辨識五線譜頁面…", done, total }),
        });
        throwIfAborted(signal);

        if (res.xml) {
          const isMixed = res.pages.some(
            (p) => (p.result.jianpuStrips?.length ?? 0) > 0,
          );
          return buildStaffResult(
            res.xml,
            res,
            isMixed ? "mixed" : "staff",
            res.stats.pages || res.pages.length || files.length,
            files,
          );
        }

        if (mode === "staff") {
          throw new Error("未能辨識出有效的五線譜內容，請確認樂譜影像清晰度或切換為「自動偵測」。");
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (mode === "staff") {
        throw err instanceof Error
          ? err
          : new Error("五線譜辨識失敗，請確認影像格式或切換識別模式。");
      }
    }
  }

  // 4. Jianpu path
  throwIfAborted(signal);
  opts.onProgress?.({ phase: "執行簡譜數字與歌詞辨識（離線 ONNX）…" });

  const input = await mergeJianpuInputIfMultiple(files);
  throwIfAborted(signal);

  const [
    { recognizeMusicppDetailed },
    { omrEmitter },
    { recognizedBeatIssues },
    { beatTag },
    { renderRecognitionSvg, doubtItems },
  ] = await Promise.all([
    import("../dolce/omr/recognize"),
    import("../dolce/omr/emit"),
    import("../dolce/omr/beats"),
    import("../dolce/model/beatcheck"),
    import("../dolce/omr/overlay"),
  ]);

  const { bin, score } = await recognizeMusicppDetailed(input.bytes, input.mime);
  throwIfAborted(signal);

  const emitted = omrEmitter("123").emit(score);
  const issues = recognizedBeatIssues(score);
  const beatMarks = issues.map((m) => ({
    boxes: m.boxes,
    text: m.text,
    tag: beatTag(m.issue),
  }));
  const doubtCount = doubtItems(score).length;

  const originals = createOriginalsManager(files);

  return {
    sourceKind: "jianpu",
    defaultView: "original",
    format: "123",
    content: emitted.text,
    beatIssues: issues.length,
    doubtCount,
    pageCount: 1,
    renderVerificationSvgs: (showOverlay: boolean) => [
      renderRecognitionSvg(bin, score, showOverlay ? "inplace" : "original", beatMarks),
    ],
    renderOriginalPageUrls: originals.renderOriginalPageUrls,
    dispose: originals.dispose,
  };
}
