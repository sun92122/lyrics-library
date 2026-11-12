import React, { Suspense, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import {
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  Columns2,
  Eye,
  FileMusic,
  FilePlus2,
  Image as ImageIcon,
  Loader2,
  Music,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import type { SongScore } from "@/content.config";
import { j123Highlighter } from "@/lib/dolce/abcfamily/highlight";
import {
  extractSongMetaAndLyricsFromScore,
  type ExtractedSongContent,
} from "@/lib/dolce-bridge/extractor";
import type {
  OmrDetectMode,
  OmrInputFile,
  OmrProgressInfo,
  OmrRunResult,
} from "@/lib/dolce-bridge/omrRunner";
import {
  convertScoreContent,
  parseScoreDoc,
  scoreFormatLabel,
  type ScoreFormat,
  type ScoreViewMode,
} from "@/lib/dolce-bridge/runtime";
import "../../styles/dolce.css";

const DolceScoreViewport = React.lazy(() => import("../DolceScoreViewport"));

export interface IncomingOmrBatch {
  id: number;
  files: File[];
}

export interface DolceOmrWorkspaceProps {
  score?: SongScore;
  originalKey?: string;
  onScoreChange: (score: SongScore | undefined) => void;
  onExtractToSong: (extracted: ExtractedSongContent) => void;
  incomingFiles?: IncomingOmrBatch | null;
}

type WorkspaceTab = "editor" | "overlay" | "compare";

const STARTER_123_TEMPLATE = `%123
T: 新建敬拜詩歌
C: 詞曲：
K: C
P: 4/4
Q: 1/4=72

1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |]
w: 在 這 裡 我 敬 拜 你 單 單 仰 望 你
`;

function detectDirectScoreFormat(fileName: string): ScoreFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".123") || lower.endsWith(".jpwabc") || lower.endsWith(".txt")) {
    return "123";
  }
  if (lower.endsWith(".abc")) return "abc";
  if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) return "musicxml";
  return null;
}

export const DolceOmrWorkspace: React.FC<DolceOmrWorkspaceProps> = ({
  score,
  originalKey,
  onScoreChange,
  onExtractToSong,
  incomingFiles,
}) => {
  const [detectMode, setDetectMode] = useState<OmrDetectMode>("auto");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("editor");
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [recognizing, setRecognizing] = useState<boolean>(false);
  const [progress, setProgress] = useState<OmrProgressInfo | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [fileSummary, setFileSummary] = useState<string>("");

  const [omrResult, setOmrResult] = useState<OmrRunResult | null>(null);
  const [verificationSvgs, setVerificationSvgs] = useState<SVGSVGElement[]>([]);
  const [originalPageUrls, setOriginalPageUrls] = useState<string[]>([]);
  const [loadingOriginals, setLoadingOriginals] = useState<boolean>(false);

  const [previewScore, setPreviewScore] = useState<SongScore | undefined>(score);
  const [localDropActive, setLocalDropActive] = useState<boolean>(false);

  const omrResultRef = useRef<OmrRunResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overlaySvgHostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastBatchIdRef = useRef<number>(-1);
  const handleFilesRef = useRef<(files: File[]) => Promise<void>>(async () => {});

  // Keep previewScore synced with a light debounce while typing in CodeMirror
  useEffect(() => {
    if (!score) {
      setPreviewScore(undefined);
      return;
    }
    if (!previewScore || previewScore.format !== score.format) {
      setPreviewScore(score);
      return;
    }
    const timer = window.setTimeout(() => {
      setPreviewScore(score);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [score]);

  // Clean up OMR resources & abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      omrResultRef.current?.dispose();
      omrResultRef.current = null;
    };
  }, []);

  // Re-render verification SVGs when omrResult or showOverlay toggle changes
  useEffect(() => {
    if (!omrResult) {
      setVerificationSvgs([]);
      return;
    }
    try {
      setVerificationSvgs(omrResult.renderVerificationSvgs(showOverlay));
    } catch {
      setVerificationSvgs([]);
    }
  }, [omrResult, showOverlay]);

  // Mount verification SVG elements into DOM hosts
  useEffect(() => {
    verificationSvgs.forEach((svg, idx) => {
      const host = overlaySvgHostRefs.current[idx];
      if (host && host.firstChild !== svg) {
        host.replaceChildren(svg);
      }
    });
  }, [verificationSvgs, activeTab]);

  // Load original page image URLs lazily when compare tab is opened
  useEffect(() => {
    if (!omrResult || activeTab !== "compare" || originalPageUrls.length > 0) {
      return;
    }
    let cancelled = false;
    setLoadingOriginals(true);
    omrResult
      .renderOriginalPageUrls()
      .then((urls) => {
        if (!cancelled) {
          setOriginalPageUrls(urls);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOriginalPageUrls([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOriginals(false);
      });
    return () => {
      cancelled = true;
    };
  }, [omrResult, activeTab, originalPageUrls.length]);

  const disposePreviousOmr = () => {
    if (omrResultRef.current) {
      omrResultRef.current.dispose();
      omrResultRef.current = null;
    }
    setOmrResult(null);
    setVerificationSvgs([]);
    setOriginalPageUrls([]);
  };

  const handleOmrFiles = async (selectedFiles: File[]) => {
    if (!selectedFiles.length) return;
    setWorkspaceError(null);
    setWorkspaceNotice(null);

    // Allow directly loading .123 / .abc / .musicxml text score files
    if (selectedFiles.length === 1) {
      const directFmt = detectDirectScoreFormat(selectedFiles[0]!.name);
      if (directFmt) {
        try {
          const text = await selectedFiles[0]!.text();
          disposePreviousOmr();
          setFileSummary(selectedFiles[0]!.name);
          setActiveTab("editor");
          const nextScore: SongScore = {
            format: directFmt,
            content: text,
            defaultView: directFmt === "musicxml" ? "staff" : "original",
          };
          setPreviewScore(nextScore);
          onScoreChange(nextScore);
          setWorkspaceNotice(
            `已匯入樂譜文字檔「${selectedFiles[0]!.name}」（${scoreFormatLabel(directFmt)}）`,
          );
          return;
        } catch (err) {
          setWorkspaceError(
            `無法讀取檔案「${selectedFiles[0]!.name}」：${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return;
        }
      }
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setRecognizing(true);
    setProgress({ phase: "載入離線辨識引擎…" });
    setFileSummary(selectedFiles.map((f) => f.name).join("、"));

    try {
      const inputFiles: OmrInputFile[] = await Promise.all(
        selectedFiles.map(async (f) => ({
          bytes: new Uint8Array(await f.arrayBuffer()),
          mime: f.type || undefined,
          name: f.name,
        })),
      );

      if (controller.signal.aborted) return;

      const { runSheetOmr } = await import("@/lib/dolce-bridge/omrRunner");
      const result = await runSheetOmr(inputFiles, {
        mode: detectMode,
        signal: controller.signal,
        onProgress: (info) => setProgress(info),
      });

      if (controller.signal.aborted) {
        result.dispose();
        return;
      }

      disposePreviousOmr();
      omrResultRef.current = result;
      setOmrResult(result);

      const nextScore: SongScore = {
        format: result.format,
        content: result.content,
        sourceKind: result.sourceKind,
        defaultView: result.defaultView,
      };
      setPreviewScore(nextScore);
      onScoreChange(nextScore);

      const hasOverlaySvgs = result.renderVerificationSvgs(true).length > 0;
      setActiveTab(hasOverlaySvgs ? "overlay" : "editor");

      const sourceLabel =
        result.sourceKind === "jianpu"
          ? "簡譜"
          : result.sourceKind === "mixed"
            ? "混合簡譜／五線譜"
            : "五線譜";
      setWorkspaceNotice(
        `辨識完成（偵測類型：${sourceLabel}，共 ${result.pageCount} 頁）。請核對節拍與歌詞後再提取或下載 JSON。`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setWorkspaceNotice("已取消樂譜辨識。");
      } else {
        setWorkspaceError(
          err instanceof Error
            ? err.message
            : "樂譜辨識失敗，請確認影像清晰度或切換識別模式。",
        );
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setRecognizing(false);
      setProgress(null);
    }
  };

  handleFilesRef.current = handleOmrFiles;

  // Receive sheet/PDF files dropped onto the parent SongBuilder window
  useEffect(() => {
    if (!incomingFiles || incomingFiles.id === lastBatchIdRef.current) return;
    lastBatchIdRef.current = incomingFiles.id;
    void handleFilesRef.current(incomingFiles.files);
  }, [incomingFiles]);

  const handleCancelRecognition = () => {
    abortControllerRef.current?.abort();
  };

  const handleFormatSwitch = (targetFormat: ScoreFormat) => {
    if (!score || score.format === targetFormat) return;
    setWorkspaceError(null);
    setWorkspaceNotice(null);
    try {
      const converted = convertScoreContent(
        score.format,
        targetFormat,
        score.content,
      );
      const nextScore: SongScore = {
        ...score,
        format: targetFormat,
        content: converted,
      };
      setPreviewScore(nextScore);
      onScoreChange(nextScore);
      setWorkspaceNotice(`已將樂譜格式轉換為「${scoreFormatLabel(targetFormat)}」。`);
    } catch (err) {
      setWorkspaceError(
        `無法轉換為 ${scoreFormatLabel(targetFormat)}：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const handleCreateStarterScore = () => {
    disposePreviousOmr();
    setWorkspaceError(null);
    const nextScore: SongScore = {
      format: "123",
      content: STARTER_123_TEMPLATE,
      sourceKind: "jianpu",
      defaultView: "original",
    };
    setPreviewScore(nextScore);
    onScoreChange(nextScore);
    setActiveTab("editor");
    setWorkspaceNotice("已建立 123 簡譜範本，可直接於下方編輯並預覽。");
  };

  const handleDetachScore = () => {
    abortControllerRef.current?.abort();
    disposePreviousOmr();
    setFileSummary("");
    setWorkspaceError(null);
    setWorkspaceNotice("已從目前歌曲移除內嵌樂譜。");
    setActiveTab("editor");
    onScoreChange(undefined);
  };

  const handleExtractClick = () => {
    if (!score?.content.trim()) return;
    setWorkspaceError(null);
    setWorkspaceNotice(null);
    try {
      const doc = parseScoreDoc(score.format, score.content);
      if (!doc.songs.length) {
        setWorkspaceError("目前樂譜內容尚未包含有效的樂曲資料，無法提取。");
        return;
      }
      const extracted = extractSongMetaAndLyricsFromScore(doc);
      onExtractToSong(extracted);
      const details: string[] = [];
      if (extracted.titleA) details.push(`歌名「${extracted.titleA}」`);
      if (extracted.originalKey) details.push(`原調 ${extracted.originalKey}`);
      if (extracted.bpm) details.push(`${extracted.bpm} BPM`);
      details.push(`${extracted.sections.length} 個歌詞段落`);
      setWorkspaceNotice(`已提取${details.join("、")}至左側歌曲表單！`);
    } catch (err) {
      setWorkspaceError(
        `解析樂譜失敗，無法提取歌詞或中繼資料：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const hasVerificationSvgs = verificationSvgs.length > 0;

  return (
    <section className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
      {/* Section Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <FileMusic className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              樂譜識別與簡譜／五線譜編輯器（Dolce OMR）
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            上傳樂譜圖片（PNG／JPG）或 PDF（含多頁五線譜／簡譜），於瀏覽器離線識別為{" "}
            <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">
              .123
            </code>{" "}
            簡譜或 MusicXML，支援即時編修、四態樂譜渲染、移調、試聽播放及一鍵提取歌詞。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!score && (
            <button
              type="button"
              onClick={handleCreateStarterScore}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>手動建立空白簡譜</span>
            </button>
          )}
          {score && (
            <>
              <button
                type="button"
                onClick={handleExtractClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" />
                <span>從樂譜提取資訊與歌詞到表單</span>
              </button>
              <button
                type="button"
                onClick={handleDetachScore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>移除樂譜</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload / Dropzone & Detection Mode Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLocalDropActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLocalDropActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLocalDropActive(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length > 0) {
              void handleOmrFiles(files);
            }
          }}
          onClick={() => !recognizing && fileInputRef.current?.click()}
          className={`lg:col-span-8 rounded-2xl border-2 border-dashed p-5 flex flex-wrap items-center justify-between gap-4 transition-all ${
            recognizing
              ? "border-indigo-300 bg-indigo-50/40 cursor-wait"
              : localDropActive
                ? "border-indigo-500 bg-indigo-50/70 scale-[1.01] cursor-pointer"
                : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70 cursor-pointer"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,application/pdf,.123,.abc,.xml,.musicxml"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                void handleOmrFiles(files);
              }
              e.target.value = "";
            }}
          />

          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
              {recognizing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {recognizing
                  ? progress?.phase || "正在執行樂譜識別…"
                  : fileSummary
                    ? `已載入：${fileSummary}`
                    : "點擊選擇或拖曳樂譜圖檔／PDF（支援多頁圖片同時選取）"}
              </div>
              <div className="text-xs text-slate-500">
                {recognizing && progress?.done !== undefined && progress?.total
                  ? `進度：第 ${progress.done} / ${progress.total} 頁`
                  : "支援 PNG、JPG、WebP、矢量／掃描 PDF，以及 .123 / .abc / .musicxml 文字檔"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {recognizing ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelRecognition();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>取消辨識</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>選擇檔案辨識</span>
              </span>
            )}
          </div>
        </div>

        {/* Mode selector + defaults */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600">
              辨識模式
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl text-xs font-medium">
              {(
                [
                  { id: "auto", label: "自動偵測" },
                  { id: "jianpu", label: "簡譜識別" },
                  { id: "staff", label: "五線譜" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={recognizing}
                  onClick={() => setDetectMode(m.id)}
                  className={`py-1.5 rounded-lg transition-all ${
                    detectMode === m.id
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {score && (
            <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-200/70">
              <span className="text-slate-600 font-medium">歌曲頁面預設檢視</span>
              <select
                value={score.defaultView ?? "original"}
                onChange={(e) =>
                  onScoreChange({
                    ...score,
                    defaultView: e.target.value as ScoreViewMode,
                  })
                }
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="original">簡譜</option>
                <option value="staff">五線譜</option>
                <option value="mixed">混排</option>
                <option value="expanded">投影</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Feedback messages */}
      {workspaceError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed break-words">{workspaceError}</span>
        </div>
      )}
      {workspaceNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed break-words">{workspaceNotice}</span>
        </div>
      )}

      {/* Editor, Overlay Review, and Live Viewport */}
      {score && (
        <div className="space-y-4 pt-2 border-t border-slate-100">
          {/* Top Sub-bar: Format Switch + Verification Tabs + OMR Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Workspace Tabs */}
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/70 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === "editor"
                    ? "bg-white text-indigo-600 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>編輯與預覽</span>
              </button>

              {omrResult && hasVerificationSvgs && (
                <button
                  type="button"
                  onClick={() => setActiveTab("overlay")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === "overlay"
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>疊加核對</span>
                </button>
              )}

              {omrResult && (
                <button
                  type="button"
                  onClick={() => setActiveTab("compare")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === "compare"
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>原圖並排對照</span>
                </button>
              )}
            </div>

            {/* OMR confidence / beat check chips */}
            {omrResult && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`px-2.5 py-1 rounded-lg border font-medium ${
                    omrResult.beatIssues > 0
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  }`}
                >
                  {omrResult.beatIssues > 0
                    ? `小節拍數異常：${omrResult.beatIssues} 處`
                    : "小節拍數完整"}
                </span>
                {omrResult.doubtCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg border bg-amber-50 border-amber-200 text-amber-800 font-medium">
                    存疑位置：{omrResult.doubtCount} 處
                  </span>
                )}
              </div>
            )}

            {/* Format Converter */}
            <div className="flex items-center gap-1.5 ml-auto text-xs">
              <span className="text-slate-500 font-medium">儲存格式：</span>
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/70">
                {(["123", "abc", "musicxml"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleFormatSwitch(fmt)}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      score.format === fmt
                        ? "bg-white text-indigo-600 shadow-sm font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {fmt === "123"
                      ? "123 簡譜"
                      : fmt === "abc"
                        ? "ABC"
                        : "MusicXML"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab: Editor & Live Viewport */}
          {activeTab === "editor" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">
                    樂譜原始碼（{scoreFormatLabel(score.format)}）
                  </span>
                  <span className="text-slate-400 font-mono">
                    {score.content.length.toLocaleString()} 字元
                  </span>
                </div>
                <div className="dolce-scope">
                  <div className="dolce-cm-dark rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
                    <CodeMirror
                      height="480px"
                      value={score.content}
                      onChange={(nextVal) =>
                        onScoreChange({
                          ...score,
                          content: nextVal,
                        })
                      }
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: false,
                        highlightActiveLine: true,
                      }}
                      extensions={[
                        EditorView.lineWrapping,
                        ...(score.format === "123" || score.format === "abc"
                          ? [j123Highlighter]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="xl:col-span-7">
                {previewScore && (
                  <Suspense
                    fallback={
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 py-16 flex flex-col items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                        <span>載入樂譜預覽…</span>
                      </div>
                    }
                  >
                    <DolceScoreViewport
                      score={previewScore}
                      originalKey={originalKey}
                      heightClass="max-h-[540px]"
                    />
                  </Suspense>
                )}
              </div>
            </div>
          )}

          {/* Tab: Verification Overlay */}
          {activeTab === "overlay" && omrResult && (
            <div className="dolce-scope space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
                <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>顯示辨識疊加標註（音高／拍號疑點框與歌詞對應）</span>
                </label>
                <span className="text-slate-500">
                  提示：切至「編輯與預覽」可微調辨識結果的音高、小節線與歌詞
                </span>
              </div>

              <div className="space-y-4 max-h-[620px] overflow-y-auto p-2 rounded-2xl bg-slate-100/70 border border-slate-200/70">
                {verificationSvgs.map((_, idx) => (
                  <div
                    key={idx}
                    ref={(el) => {
                      overlaySvgHostRefs.current[idx] = el;
                    }}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tab: Side-by-Side Comparison */}
          {activeTab === "compare" && omrResult && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>原始上傳樂譜影像</span>
                </div>
                <div className="max-h-[560px] overflow-y-auto space-y-3 p-3 rounded-2xl bg-slate-100 border border-slate-200">
                  {loadingOriginals ? (
                    <div className="py-16 flex flex-col items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>正在載入原圖預覽…</span>
                    </div>
                  ) : originalPageUrls.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      找不到可顯示的原始影像
                    </div>
                  ) : (
                    originalPageUrls.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`原譜第 ${idx + 1} 頁`}
                        className="w-full h-auto rounded-lg border border-slate-200 bg-white shadow-sm"
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="xl:col-span-7">
                {previewScore && (
                  <Suspense
                    fallback={
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 py-16 flex flex-col items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                        <span>載入樂譜預覽…</span>
                      </div>
                    }
                  >
                    <DolceScoreViewport
                      score={previewScore}
                      originalKey={originalKey}
                      heightClass="max-h-[560px]"
                    />
                  </Suspense>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default DolceOmrWorkspace;