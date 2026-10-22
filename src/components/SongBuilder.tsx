import React, { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import * as prettier from "prettier/standalone";
import parserBabel from "prettier/plugins/babel";
import parserEstree from "prettier/plugins/estree";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  FLOW_STYLE,
  FLOW_ALIASES,
  FLOW_NAMES,
  EX_FLOWS,
  getFlowName,
  type FlowMapping,
} from "@/constants/flow";
import type { SongData, SectionItem } from "@/content.config";
import {
  Fieldset,
  Input,
  Label,
  Legend,
  Select,
  Textarea,
  Button,
  Field,
  Switch,
} from "@headlessui/react";
import {
  Sparkles,
  Undo2,
  Redo2,
  UploadCloud,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { LyricsViewer } from "@/components/LyricsViewer";
import {
  customHighlight,
  replacePronounsAndSelect,
  undoAction,
  redoAction,
} from "@/utils/simpleEditor";
import {
  proPresenterExportModalOpen,
  currentSong,
  flow,
} from "@/stores/settings";

function matchFlowAlias(line: string): {
  isValid: boolean;
  sectionName: string;
} {
  const trimmed = line.trim();
  if (!trimmed) return { isValid: false, sectionName: "" };

  const candidates: string[] = [];

  // [段落名]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    candidates.push(trimmed.slice(1, -1).trim());
  }
  // # 段落名
  if (trimmed.startsWith("#")) {
    candidates.push(trimmed.replace(/^#+\s*/, "").trim());
  }
  // 段落名
  candidates.push(trimmed.replace(/:$/, "").trim());

  for (const cand of candidates) {
    if (!cand) continue;

    const candLower = cand.toLowerCase();
    const candNoSpace = candLower.replace(/\s+/g, "");
    const candWithoutDollar = cand.startsWith("$") ? cand.slice(1) : cand;
    const candWithoutDollarLower = candWithoutDollar.toLowerCase();
    const candWithoutDollarNoSpace = candWithoutDollarLower.replace(/\s+/g, "");

    const resolved =
      FLOW_ALIASES[cand] ||
      FLOW_ALIASES[candLower] ||
      FLOW_ALIASES[candNoSpace] ||
      FLOW_ALIASES[candWithoutDollar] ||
      FLOW_ALIASES[candWithoutDollarLower] ||
      FLOW_ALIASES[candWithoutDollarNoSpace] ||
      (cand.startsWith("$") &&
      (cand in FLOW_STYLE ||
        cand in FLOW_NAMES["Magical"] ||
        cand in FLOW_NAMES["ProPresenter"] ||
        cand in FLOW_NAMES["繁體中文"] ||
        cand in FLOW_NAMES["簡體中文"])
        ? cand
        : undefined);

    // 核心條件：開頭為 '$' 即為合法段落
    if (typeof resolved === "string" && resolved.startsWith("$")) {
      return { isValid: true, sectionName: resolved };
    }
  }

  return { isValid: false, sectionName: "" };
}

function parseLineWithChords(raw: string): {
  text: string;
  chords: { index: number; chord: string }[];
} {
  let text = "";
  const chords: { index: number; chord: string }[] = [];
  let cursor = 0;
  let charCount = 0;

  while (cursor < raw.length) {
    if (raw[cursor] === "[") {
      const closeIdx = raw.indexOf("]", cursor);
      if (closeIdx !== -1) {
        const chord = raw.slice(cursor + 1, closeIdx).trim();
        if (chord) {
          chords.push({ index: charCount, chord });
        }
        cursor = closeIdx + 1;
        continue;
      }
    }
    text += raw[cursor];
    charCount++;
    cursor++;
  }

  return { text, chords };
}

function parseLyricsText(
  text: string,
  isBilingual: boolean,
): {
  name: string;
  lines: {
    a: string;
    b?: string;
    chords?: { index: number; chord: string }[];
  }[];
}[] {
  const rawLines = text.split("\n").map((l) => l.trimEnd());
  const sections: {
    name: string;
    lines: {
      a: string;
      b?: string;
      chords?: { index: number; chord: string }[];
    }[];
  }[] = [];
  let currentSection: {
    name: string;
    lines: {
      a: string;
      b?: string;
      chords?: { index: number; chord: string }[];
    }[];
  } | null = null;

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    const sectionMatch = matchFlowAlias(line);
    if (sectionMatch.isValid) {
      if (currentSection && currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        name: sectionMatch.sectionName,
        lines: [],
      };
      i++;
      continue;
    }

    if (!currentSection) {
      currentSection = { name: "Unknown", lines: [] };
    }

    if (isBilingual) {
      const parsedA = parseLineWithChords(line);
      let lineB = "";

      if (i + 1 < rawLines.length) {
        const nextTrimmed = rawLines[i + 1].trim();
        if (nextTrimmed && !matchFlowAlias(nextTrimmed).isValid) {
          lineB = nextTrimmed;
          i++;
        }
      }

      currentSection.lines.push({
        a: parsedA.text,
        ...(lineB ? { b: lineB.replaceAll("\\n", "\n") } : {}),
        ...(parsedA.chords.length > 0 ? { chords: parsedA.chords } : {}),
      });
    } else {
      const parsedA = parseLineWithChords(line);
      currentSection.lines.push({
        a: parsedA.text,
        ...(parsedA.chords.length > 0 ? { chords: parsedA.chords } : {}),
      });
    }
    i++;
  }

  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

export function convertSectionsToRawLyrics(
  sections: SectionItem[],
  isBilingual: boolean,
): string {
  const result: string[] = [];

  for (const section of sections) {
    const tag =
      getFlowName(section.name, "Magical") ||
      section.name.replace(/^\$/, "") ||
      section.name;
    result.push(`[${tag}]`);

    for (const line of section.lines) {
      let lineA = line.a;
      if (line.chords && line.chords.length > 0) {
        const sortedChords = [...line.chords].sort((x, y) => x.index - y.index);
        let built = "";
        let prevIndex = 0;
        for (const c of sortedChords) {
          const idx = Math.min(Math.max(c.index, 0), lineA.length);
          built += lineA.slice(prevIndex, idx) + `[${c.chord}]`;
          prevIndex = idx;
        }
        built += lineA.slice(prevIndex);
        lineA = built;
      }
      result.push(lineA);

      if (isBilingual) {
        if (line.b !== undefined && line.b !== null && line.b !== "") {
          result.push(line.b.replaceAll("\r\n", "\\n").replaceAll("\n", "\\n"));
        } else {
          result.push("");
        }
      }
    }
    result.push("");
  }

  return result.join("\n").trimEnd();
}

export type ValidationResult =
  { success: true; data: SongData } | { success: false; error: string };

export function validateSongData(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { success: false, error: "檔案內容必須為 JSON 物件" };
  }

  const obj = raw as Record<string, any>;

  if (!obj.meta || typeof obj.meta !== "object" || Array.isArray(obj.meta)) {
    return { success: false, error: "缺少歌曲中繼資料 (meta)" };
  }

  let titleObj = obj.meta.title;
  if (typeof titleObj === "string") {
    titleObj = { a: titleObj, b: "" };
  }

  if (
    !titleObj ||
    typeof titleObj !== "object" ||
    Array.isArray(titleObj) ||
    !titleObj.a ||
    typeof titleObj.a !== "string" ||
    !titleObj.a.trim()
  ) {
    return { success: false, error: "缺少歌曲主要名稱 (meta.title.a)" };
  }

  if (!obj.sections || !Array.isArray(obj.sections)) {
    return { success: false, error: "缺少段落列表 (sections)" };
  }

  if (obj.sections.length === 0) {
    return { success: false, error: "段落列表 (sections) 不能為空" };
  }

  for (let sIdx = 0; sIdx < obj.sections.length; sIdx++) {
    const sec = obj.sections[sIdx];
    if (!sec || typeof sec !== "object" || Array.isArray(sec)) {
      return { success: false, error: `第 ${sIdx + 1} 個段落格式無效` };
    }
    if (!sec.name || typeof sec.name !== "string" || !sec.name.trim()) {
      return {
        success: false,
        error: `第 ${sIdx + 1} 個段落缺少段落名稱 (name)`,
      };
    }
    if (!Array.isArray(sec.lines)) {
      return {
        success: false,
        error: `段落「${sec.name}」缺少歌詞行列表 (lines)`,
      };
    }
    for (let lIdx = 0; lIdx < sec.lines.length; lIdx++) {
      const line = sec.lines[lIdx];
      if (
        !line ||
        typeof line !== "object" ||
        Array.isArray(line) ||
        typeof line.a !== "string"
      ) {
        return {
          success: false,
          error: `段落「${sec.name}」第 ${lIdx + 1} 行缺少主要歌詞 (a)`,
        };
      }
    }
  }

  const normalizedData: SongData = {
    meta: {
      languages: {
        a:
          typeof obj.meta.languages?.a === "string" &&
          obj.meta.languages.a.trim()
            ? obj.meta.languages.a.trim()
            : "中文",
        b:
          typeof obj.meta.languages?.b === "string"
            ? obj.meta.languages.b.trim()
            : "",
      },
      title: {
        a: titleObj.a.trim(),
        b: typeof titleObj.b === "string" ? titleObj.b.trim() : "",
      },
      author: typeof obj.meta.author === "string" ? obj.meta.author : "",
      originalKey:
        typeof obj.meta.originalKey === "string" ? obj.meta.originalKey : "",
      bpm: typeof obj.meta.bpm === "number" ? obj.meta.bpm : undefined,
      ccli:
        obj.meta.ccli !== undefined && obj.meta.ccli !== null
          ? String(obj.meta.ccli)
          : "",
      note: typeof obj.meta.note === "string" ? obj.meta.note : "",
      tags: Array.isArray(obj.meta.tags)
        ? obj.meta.tags
            .filter((t: any) => typeof t === "string" && t.trim())
            .map((t: string) => t.trim())
        : [],
      assets: Array.isArray(obj.meta.assets)
        ? obj.meta.assets
            .filter((a: any) => a && typeof a === "object")
            .map((asset: any) => ({
              type: [
                "pdf",
                "video",
                "audio",
                "slide",
                "youtube",
                "other",
              ].includes(asset.type)
                ? asset.type
                : "other",
              name: typeof asset.name === "string" ? asset.name : "",
              url: typeof asset.url === "string" ? asset.url : "",
              ...(typeof asset.size === "string" ? { size: asset.size } : {}),
            }))
        : [],
      arrangement: Array.isArray(obj.meta.arrangement)
        ? obj.meta.arrangement.filter((n: any) => typeof n === "number")
        : [],
    },
    sections: obj.sections.map((sec: any) => ({
      name: sec.name.trim(),
      lines: sec.lines.map((line: any) => ({
        a: line.a,
        ...(typeof line.b === "string" ? { b: line.b } : {}),
        ...(Array.isArray(line.chords)
          ? {
              chords: line.chords
                .filter(
                  (c: any) =>
                    c &&
                    typeof c.index === "number" &&
                    typeof c.chord === "string",
                )
                .map((c: any) => ({ index: c.index, chord: c.chord })),
            }
          : {}),
      })),
    })),
  };

  return { success: true, data: normalizedData };
}

function getYoutubeVideoUrl(url: string): string | null {
  const yturl = new URL(url);
  const videoId =
    yturl.searchParams.get("v") ||
    yturl.pathname.split("/").pop()?.slice(0, 11);
  if (!videoId) return null;

  const t = yturl.searchParams.get("t");

  return `https://www.youtube.com/watch?v=${videoId}` + (t ? `&t=${t}` : "");
}

export const SongBuilder: React.FC = () => {
  const [isBilingual, setIsBilingual] = useState(false);
  const [id, setId] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SongData["meta"]>({
    languages: { a: "中文", b: "" },
    title: { a: "", b: "" },
    tags: [],
    arrangement: [],
    assets: [{ type: "youtube", name: "YouTube", url: "" }],
  });
  const [tagsInput, setTagsInput] = useState<string>("");
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [rawLyrics, setRawLyrics] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const editorViewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef<number>(0);

  const loadSongFile = (songData: SongData, fileName?: string) => {
    const isBilingualSong = Boolean(
      songData.meta?.languages?.b ||
      songData.sections?.some((s) => s.lines.some((l) => l.b)),
    );

    const raw = convertSectionsToRawLyrics(
      songData.sections || [],
      isBilingualSong,
    );

    const fileId = fileName ? fileName.replace(/\.[^/.]+$/, "") : "";
    const nextId =
      fileId ||
      (songData.meta?.title?.b &&
        songData.meta.title.b
          .replace(/[\s,-]+/g, "-")
          .replace(/[’‘`‛ʼʻʽ＇']/g, "")
          .toLowerCase()) ||
      "";

    setId(nextId);
    setIdError(null);
    setIsBilingual(isBilingualSong);
    setRawLyrics(raw);
    setSections(songData.sections);

    const tags = songData.meta?.tags || [];
    setTagsInput(tags.join(", "));

    setMeta({
      languages: {
        a: songData.meta?.languages?.a || "中文",
        b: songData.meta?.languages?.b || (isBilingualSong ? "English" : ""),
      },
      title: {
        a: songData.meta?.title?.a || "",
        b: songData.meta?.title?.b || "",
      },
      author: songData.meta?.author || "",
      originalKey: songData.meta?.originalKey || "",
      bpm: songData.meta?.bpm,
      ccli: songData.meta?.ccli || "",
      tags,
      assets:
        songData.meta?.assets && songData.meta.assets.length > 0
          ? songData.meta.assets
          : [{ type: "youtube", name: "YouTube", url: "" }],
      arrangement: songData.meta?.arrangement || [],
      note: songData.meta?.note || "",
    });
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setFeedback({
          type: "error",
          message: `檔案「${file.name}」無法解析為 JSON 格式，請確認是否為正確的歌曲 JSON 檔案。`,
        });
        return;
      }

      const validation = validateSongData(json);
      if (!validation.success) {
        setFeedback({
          type: "error",
          message: `檔案「${file.name}」不是合法的歌曲檔案：${validation.error}`,
        });
        return;
      }

      loadSongFile(validation.data, file.name);
      setFeedback({
        type: "success",
        message: `已成功載入歌曲「${validation.data.meta.title.a}」內容（來源：${file.name}），已覆蓋當前頁面內容！`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `讀取檔案「${file.name}」時發生錯誤：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (feedback?.type === "success") {
      timer = setTimeout(() => {
        setFeedback(null);
      }, 6000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [feedback]);

  useEffect(() => {
    const isFileDrag = (e: DragEvent) => {
      if (!e.dataTransfer) return false;
      return (
        Array.from(e.dataTransfer.types).includes("Files") ||
        e.dataTransfer.types.includes("application/x-moz-file")
      );
    };

    const handleDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragging(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current--;

      const leftWindow =
        !e.relatedTarget &&
        (e.clientX <= 0 ||
          e.clientY <= 0 ||
          e.clientX >= window.innerWidth ||
          e.clientY >= window.innerHeight);

      if (dragCounterRef.current <= 0 || leftWindow) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (
        e.dataTransfer &&
        e.dataTransfer.files &&
        e.dataTransfer.files.length > 0
      ) {
        const file = e.dataTransfer.files[0];
        handleFile(file);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    window.addEventListener("dragenter", handleDragEnter, true);
    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("dragleave", handleDragLeave, true);
    window.addEventListener("drop", handleDrop, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter, true);
      window.removeEventListener("dragover", handleDragOver, true);
      window.removeEventListener("dragleave", handleDragLeave, true);
      window.removeEventListener("drop", handleDrop, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  const handleReplace = () => {
    replacePronounsAndSelect(editorViewRef.current);
  };

  useEffect(() => {
    const parsedSections = parseLyricsText(rawLyrics, isBilingual);
    setSections(parsedSections);
    if (parsedSections.some((sec) => sec.lines.some((line) => line.b))) {
      setMeta((prev) => ({
        ...prev,
        languages: { ...prev.languages, b: prev.languages.b || "English" },
      }));
    }
  }, [rawLyrics, isBilingual]);
  useEffect(() => {
    setMeta((prev) => ({
      ...prev,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
    }));
  }, [tagsInput]);

  const handleDownloadJson = async () => {
    const songData: SongData = {
      meta,
      sections,
    };
    songData.meta.assets = songData.meta.assets?.filter(
      (asset) => asset.name && asset.url,
    );
    if (!songData.meta.title.a || !songData.meta.languages.a) {
      setIdError("請設定歌曲主要名稱和語言");
      return;
    }
    const currentId =
      id ||
      (meta.title.b &&
        meta.title.b
          .replace(/[\s,-]+/g, "-")
          .replace(/[’‘`‛ʼʻʽ＇']/g, "")
          .toLowerCase()) ||
      "";
    if (!id) {
      setId(currentId || "");
    }
    if (!currentId) {
      setIdError("請設定 ID 或英文歌曲名稱");
      return;
    } else {
      setIdError(null);
    }
    const jsonStr = JSON.stringify(songData, null, 2);
    let formattedJsonStr = jsonStr;

    try {
      formattedJsonStr = await prettier.format(jsonStr, {
        parser: "json",
        plugins: [parserBabel, parserEstree],
      });
    } catch (err) {
      console.warn("Prettier 格式化 JSON 失敗，將使用原始 JSON 字串", err);
    }

    const blob = new Blob([formattedJsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentId + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadComponent = (
    <>
      <div className="flex px-6 items-baseline">
        <Input
          value={id}
          onChange={(e) => {
            setId(
              e.target.value
                .replace(/[\s,-]+/g, "-")
                .replace(/[’‘`‛ʼʻʽ＇']/g, "")
                .toLowerCase(),
            );
            setIdError(null);
          }}
          placeholder={
            meta.title.b
              ? meta.title.b
                  .replace(/[\s,-]+/g, "-")
                  .replace(/[’‘`‛ʼʻʽ＇']/g, "")
                  .toLowerCase()
              : "song-id"
          }
          className="text-right w-[50%] rounded-lg p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        .json
        <Button
          type="button"
          onClick={handleDownloadJson}
          className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          下載 JSON
        </Button>
      </div>
      {idError && (
        <div className="flex w-full justify-center text-sm text-red-500 !m-0">
          {idError}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-8">
      {/* Drag & Drop Full-screen Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 pointer-events-none select-none transition-opacity duration-150">
          <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-2xl border-4 border-dashed border-indigo-500 max-w-lg w-full text-center space-y-4 transform scale-105 transition-transform">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <UploadCloud className="w-10 h-10 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                釋放以載入歌曲檔案
              </h3>
              <p className="text-sm text-slate-500">
                支援合法的歌曲 JSON 檔案，載入後將覆蓋當前內容以供修改
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>自動填入歌曲名稱、調性、段落標籤與歌序</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Song Builder</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            產生歌曲 JSON
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            支援直接編輯或將歌曲 JSON 檔案拖曳至此頁面載入進行修改。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFile(file);
              }
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium border border-slate-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4 text-indigo-400" />
            <span>匯入現有歌曲 JSON</span>
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {/* <Layers className="w-5 h-5 text-indigo-600" /> */}
              <span>導入歌詞資料</span>
            </h2>
            <Field className="flex items-center gap-3">
              <Label>雙語模式</Label>
              <Switch
                checked={isBilingual}
                onChange={setIsBilingual}
                className={`${
                  isBilingual ? "bg-blue-600" : "bg-gray-200"
                } relative inline-flex h-6 w-11 items-center rounded-full`}
              >
                <span
                  className={`${
                    isBilingual ? "translate-x-6" : "translate-x-1"
                  } inline-block h-4 w-4 transform rounded-full bg-white transition`}
                />
              </Switch>
            </Field>
          </div>
          <span className="text-sm text-slate-500">歌曲資訊</span>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                歌曲名稱*
              </Label>
              <Input
                value={meta.title.a}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    title: { ...prev.title, a: e.target.value },
                  }))
                }
                onBlur={(e) => {
                  const trimmed = e.target.value.trim();
                  if (trimmed !== e.target.value) {
                    setMeta((prev) => ({
                      ...prev,
                      title: { ...prev.title, a: trimmed },
                    }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const cursorIndex = e.currentTarget.selectionStart;
                    const cursorEndIndex = e.currentTarget.selectionEnd;
                    if (!cursorIndex) return;

                    const before = meta.title.a.slice(0, cursorIndex).trim();
                    const after = meta.title.a
                      .slice(cursorEndIndex || cursorIndex)
                      .trim();

                    setMeta((prev) => ({
                      ...prev,
                      title: {
                        ...prev.title,
                        a: before,
                        b: (prev.title.b || "") + after,
                      },
                    }));
                  }
                }}
                placeholder="奇異恩典"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                歌曲名稱 (次要語言/英文)
              </Label>
              <Input
                value={meta.title.b}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    title: { ...prev.title, b: e.target.value },
                  }))
                }
                onBlur={(e) => {
                  const trimmed = e.target.value.trim();
                  if (trimmed !== e.target.value) {
                    setMeta((prev) => ({
                      ...prev,
                      title: { ...prev.title, b: trimmed },
                    }));
                  }
                }}
                placeholder="Amazing Grace"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                主要語言*
              </Label>
              <Input
                value={meta.languages.a}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    languages: { ...prev.languages, a: e.target.value },
                  }))
                }
                placeholder="中文"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                次要語言
              </Label>
              <Input
                value={meta.languages.b}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    languages: { ...prev.languages, b: e.target.value },
                  }))
                }
                placeholder="English"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>
          <Field className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              創作者 / 樂團 (Author / Artist)
            </Label>
            <Textarea
              value={meta.author}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, author: e.target.value }))
              }
              onBlur={(e) => {
                const trimmed = e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line !== "")
                  .join("\n");
                if (trimmed !== e.target.value) {
                  setMeta((prev) => ({ ...prev, author: trimmed }));
                }
              }}
              placeholder="作詞：John Newton"
              rows={3}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </Field>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                原調 (Original Key)
              </Label>
              <Input
                value={meta.originalKey}
                onChange={(e) =>
                  setMeta((prev) => ({ ...prev, originalKey: e.target.value }))
                }
                placeholder="G, F#m"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">BPM</Label>
              <Input
                type="number"
                value={meta.bpm || ""}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    bpm: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  }))
                }
                placeholder="72"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                標籤 (Tags)
              </Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="敬拜, 恩典, 經典, 約書亞樂團, Hillsong"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">CCLI</Label>
              <Input
                value={meta.ccli || ""}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    ccli: e.target.value ? e.target.value.trim() : undefined,
                  }))
                }
                placeholder="2762836"
                type="number"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-slate-700 w-full flex items-start max-sm:flex-col">
              <span className="shrink-0">
                原始歌詞
                <span className="ml-2 text-xs text-slate-400">
                  支持部分編輯器快捷鍵
                </span>
              </span>
              <div className="ml-2 w-full justify-between flex items-center max-sm:mt-2">
                <>
                  <Button
                    type="button"
                    onClick={() => {
                      const trimmed = rawLyrics
                        .split("\n")
                        .map((line) => line.trim().replaceAll(/\s+/g, " "))
                        .join("\n");
                      setRawLyrics(trimmed);
                    }}
                    className="ml-2 px-2 py-0.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
                  >
                    Trim
                  </Button>
                  <Button
                    type="button"
                    onClick={handleReplace}
                    className="ml-2 px-2 py-0.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
                  >
                    亻➔礻
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const replaced = rawLyrics
                        .split("\n")
                        .map((line) =>
                          line
                            .replaceAll(/[’‘`‛ʼʻʽ＇]/g, "'")
                            .replace(/[.,!;:。，！、；：…—]+\s*$/g, ""),
                        )
                        .join("\n");
                      setRawLyrics(replaced);
                    }}
                    className="ml-2 px-2 py-0.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    onClick={() => undoAction(editorViewRef.current)}
                    className="ml-4 px-2 py-0.5 text-gray-700 rounded-lg text-xs font-medium hover:text-gray-900 transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => redoAction(editorViewRef.current)}
                    className="ml-2 px-2 py-0.5 text-gray-700 rounded-lg text-xs font-medium hover:text-gray-900 transition-colors"
                  >
                    <Redo2 className="w-4 h-4" />
                  </Button>
                </>
                <Button
                  type="button"
                  onClick={() => setRawLyrics("")}
                  disabled={!rawLyrics}
                  className={`ml-auto px-2 py-0.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors ${!rawLyrics ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  清空
                </Button>
              </div>
            </div>
            <CodeMirror
              className="w-full rounded-lg border border-slate-300 p-3 cm-custom"
              placeholder="在此輸入原始歌詞，支援段落標記 [V1]、[C] 等"
              height="300px"
              value={rawLyrics}
              onChange={(value) => setRawLyrics(value)}
              indentWithTab={false}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLineGutter: false,
                highlightActiveLine: false,
              }}
              extensions={[
                customHighlight,
                EditorState.allowMultipleSelections.of(true),
              ]}
              onCreateEditor={(view) => {
                editorViewRef.current = view;
              }}
            />
          </div>

          <Field className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              歌曲備註
            </Label>
            <Textarea
              value={meta.note}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="在此輸入歌曲備註"
              rows={1}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </Field>

          <div>
            <span className="block text-sm text-slate-500">附加資源</span>
            {meta.assets &&
              meta.assets.length > 0 &&
              meta.assets.map((asset, index) => (
                <div key={index}>
                  <div className="flex flex-col gap-2 mt-2 border-collapse border border-slate-200 rounded-lg p-4">
                    <div className="w-full flex text-sm font-medium text-slate-700">
                      <span>資源 {index + 1}</span>
                      <Button
                        type="button"
                        onClick={() =>
                          setMeta((prev) => {
                            const newAssets = [...(prev.assets || [])];
                            newAssets.splice(index, 1);
                            return { ...prev, assets: newAssets };
                          })
                        }
                        className="ml-auto px-2 py-0.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                      >
                        刪除
                      </Button>
                    </div>
                    <Field className="grid grid-cols-2 gap-4">
                      <Field className="flex flex-col gap-2">
                        <Label className="text-sm font-medium text-slate-700">
                          名稱
                        </Label>
                        <Input
                          value={asset.name}
                          onChange={(e) =>
                            setMeta((prev) => {
                              const newAssets = [...(prev.assets || [])];
                              newAssets[index] = {
                                ...newAssets[index],
                                name: e.target.value,
                              };
                              return { ...prev, assets: newAssets };
                            })
                          }
                          placeholder="YouTube"
                          className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </Field>
                      <Field className="flex flex-col gap-2">
                        <Label className="text-sm font-medium text-slate-700">
                          類型
                        </Label>
                        <div className="w-full !rounded-lg border border-slate-300 h-[46px]">
                          <Select
                            value={asset.type}
                            onChange={(e) =>
                              setMeta((prev) => {
                                const newAssets = [...(prev.assets || [])];
                                newAssets[index] = {
                                  ...newAssets[index],
                                  type: e.target.value as any,
                                };
                                return { ...prev, assets: newAssets };
                              })
                            }
                            className="w-full h-full bg-transparent text-sm pl-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                          >
                            <option value="youtube">YouTube</option>
                            <option value="pdf">PDF</option>
                            <option value="video">影片</option>
                            <option value="audio">音訊</option>
                            <option value="slide">簡報</option>
                            <option value="other">其他連結</option>
                          </Select>
                        </div>
                      </Field>
                    </Field>
                    <Field>
                      <Input
                        value={asset.url}
                        onChange={(e) =>
                          setMeta((prev) => {
                            const newAssets = [...(prev.assets || [])];
                            newAssets[index] = {
                              ...newAssets[index],
                              url: e.target.value,
                            };
                            return { ...prev, assets: newAssets };
                          })
                        }
                        onBlur={(e) => {
                          if (asset.type === "youtube") {
                            const validUrl = getYoutubeVideoUrl(e.target.value);
                            if (validUrl) {
                              setMeta((prev) => {
                                const newAssets = [...(prev.assets || [])];
                                newAssets[index] = {
                                  ...newAssets[index],
                                  url: validUrl,
                                };
                                return { ...prev, assets: newAssets };
                              });
                            }
                          }
                        }}
                        placeholder="https://www.youtube.com/watch?v=example"
                        className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            <Button
              type="button"
              onClick={() =>
                setMeta((prev) => ({
                  ...prev,
                  assets: prev.assets
                    ? [
                        ...prev.assets,
                        { type: "youtube", name: "YouTube", url: "" },
                      ]
                    : [
                        {
                          type: "youtube",
                          name: "YouTube",
                          url: "",
                        },
                      ],
                }))
              }
              className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              新增資源
            </Button>
          </div>

          {/* <div>
            <span className="text-sm text-slate-500">meta 預覽</span>
            <pre className="bg-slate-100 p-4 rounded-lg text-sm text-slate-800 overflow-x-auto">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div> */}
        </div>

        {/* Right */}
        <div className="lg:col-span-5 space-y-6">
          {downloadComponent}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">設定預設編曲</h2>
            {/* Flow Builder */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">歌序</span>
                <span className="text-[11px] text-slate-400 ml-auto mr-1">
                  段落：
                </span>
                <div className="flex flex-wrap max-w-[80%] w-full items-center gap-1">
                  {sections.map((preset, presetIndex) => {
                    const tag = getFlowName(preset.name);
                    const tagIndex = presetIndex;
                    return (
                      <button
                        key={`tag-${tagIndex}`}
                        type="button"
                        onClick={() =>
                          setMeta((prev) => {
                            const newArrangement = prev.arrangement
                              ? [...prev.arrangement]
                              : [];
                            newArrangement.push(tagIndex);
                            return {
                              ...prev,
                              arrangement: newArrangement,
                            };
                          })
                        }
                        className="whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {/* gap */}
                  <div className="flex-initial flex-shrink-0 w-px h-3 bg-slate-200 mx-1"></div>
                  {EX_FLOWS.map((preset, presetIndex) => {
                    const tag = getFlowName(preset);
                    const tagIndex = presetIndex + (sections.length || 0);
                    return (
                      <button
                        key={`tag-${tagIndex}`}
                        type="button"
                        onClick={() =>
                          setMeta((prev) => {
                            const newArrangement = prev.arrangement
                              ? [...prev.arrangement]
                              : [];
                            newArrangement.push(tagIndex);
                            return {
                              ...prev,
                              arrangement: newArrangement,
                            };
                          })
                        }
                        className="whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Flow badges sequence */}
              {meta.arrangement && meta.arrangement.length > 0 ? (
                <>
                  <div className="w-full inline-block items-center !mt-1 px-2 pt-1 pb-2 bg-white rounded-xl border border-slate-200/80 min-h-[36px]">
                    {meta.arrangement.map((tagIndex, tIndex) => {
                      const tag =
                        tagIndex < (sections.length || 0)
                          ? sections[tagIndex].name
                          : tagIndex < (sections.length || 0) + EX_FLOWS.length
                            ? EX_FLOWS[tagIndex - (sections.length || 0)]
                            : "?";
                      return (
                        <div
                          className="mt-1 inline-block text-wrap items-center"
                          key={tIndex}
                        >
                          <ContextMenu.Root>
                            <ContextMenu.Trigger asChild>
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-100"
                                style={{
                                  backgroundColor:
                                    (FLOW_STYLE[tag as keyof FlowMapping] ??
                                      FLOW_STYLE["default"]) + "22",
                                  color:
                                    FLOW_STYLE[tag as keyof FlowMapping] ??
                                    FLOW_STYLE["default"],
                                  borderColor:
                                    (FLOW_STYLE[tag as keyof FlowMapping] ??
                                      FLOW_STYLE["default"]) + "44",
                                }}
                              >
                                {getFlowName(tag)}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMeta((prev) => {
                                      const newArrangement = prev.arrangement
                                        ? [...prev.arrangement]
                                        : [];
                                      newArrangement.splice(tIndex, 1);
                                      return {
                                        ...prev,
                                        arrangement: newArrangement,
                                      };
                                    });
                                  }}
                                  className="hover:text-rose-600 transition-colors ml-0.5 select-none"
                                >
                                  ×
                                </button>
                              </span>
                            </ContextMenu.Trigger>
                            <ContextMenu.Content className="bg-white rounded-lg shadow-lg border border-slate-200/80 p-2 min-w-[120px] z-50">
                              {/* 左移、右移、更換 */}
                              <ContextMenu.Item
                                onSelect={() => {
                                  setMeta((prev) => {
                                    if (!prev.arrangement) return prev;
                                    const newArrangement = [
                                      ...prev.arrangement,
                                    ];
                                    if (tIndex > 0) {
                                      const temp = newArrangement[tIndex - 1];
                                      newArrangement[tIndex - 1] =
                                        newArrangement[tIndex];
                                      newArrangement[tIndex] = temp;
                                    }
                                    return {
                                      ...prev,
                                      arrangement: newArrangement,
                                    };
                                  });
                                }}
                                className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                              >
                                左移
                              </ContextMenu.Item>
                              <ContextMenu.Item
                                onSelect={() => {
                                  setMeta((prev) => {
                                    if (!prev.arrangement) return prev;
                                    const newArrangement = [
                                      ...prev.arrangement,
                                    ];
                                    if (tIndex < newArrangement.length - 1) {
                                      const temp = newArrangement[tIndex + 1];
                                      newArrangement[tIndex + 1] =
                                        newArrangement[tIndex];
                                      newArrangement[tIndex] = temp;
                                    }
                                    return {
                                      ...prev,
                                      arrangement: newArrangement,
                                    };
                                  });
                                }}
                                className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                              >
                                右移
                              </ContextMenu.Item>
                              <ContextMenu.Separator className="my-1 border-t border-slate-200" />
                              {sections.map((preset, presetIndex) => {
                                const presetTag = getFlowName(preset.name);
                                const presetTagIndex = presetIndex;
                                return (
                                  <ContextMenu.Item
                                    key={`replace-${presetTagIndex}`}
                                    onSelect={() => {
                                      setMeta((prev) => {
                                        if (!prev.arrangement) return prev;
                                        const newArrangement = [
                                          ...prev.arrangement,
                                        ];
                                        newArrangement[tIndex] = presetTagIndex;
                                        return {
                                          ...prev,
                                          arrangement: newArrangement,
                                        };
                                      });
                                    }}
                                    className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                                  >
                                    更換為 {presetTag}
                                  </ContextMenu.Item>
                                );
                              })}
                              {EX_FLOWS.map((preset, presetIndex) => {
                                const presetTag = getFlowName(preset);
                                const presetTagIndex =
                                  presetIndex + (sections.length || 0);
                                return (
                                  <ContextMenu.Item
                                    key={`replace-ex-${presetTagIndex}`}
                                    onSelect={() => {
                                      setMeta((prev) => {
                                        if (!prev.arrangement) return prev;
                                        const newArrangement = [
                                          ...prev.arrangement,
                                        ];
                                        newArrangement[tIndex] = presetTagIndex;
                                        return {
                                          ...prev,
                                          arrangement: newArrangement,
                                        };
                                      });
                                    }}
                                    className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                                  >
                                    更換為 {presetTag}
                                  </ContextMenu.Item>
                                );
                              })}
                            </ContextMenu.Content>
                          </ContextMenu.Root>
                          {meta.arrangement &&
                            tIndex < meta.arrangement.length - 1 && (
                              <>
                                <span style={{ fontSize: 0 }}> </span>
                                <span className="text-slate-300 text-xs select-none mx-1">
                                  ➔
                                </span>
                              </>
                            )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="w-full flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setMeta((prev) => ({ ...prev, arrangement: [] }))
                      }
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium select-none transition-colors"
                    >
                      清除歌序
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-400 italic">
                  尚未設定流程（點選上方標籤即可依序加入流程）
                </div>
              )}
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">歌詞預覽</h2>
              <Button
                type="button"
                onClick={() => {
                  currentSong.set({ meta, sections });
                  flow.set(meta.arrangement || []);
                  proPresenterExportModalOpen.set(true);
                }}
                className="flex items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm bg-amber-500 hover:bg-amber-600 text-amber-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={sections.length === 0 || !meta.title.a}
              >
                ProPresenter
              </Button>
            </div>
            {/* Render parsed sections */}
            {sections.length > 0 ? (
              <LyricsViewer
                song={{ meta, sections }}
                readonly={true}
                ui={{ container: "!border-0 !p-2 !shadow-none" }}
              />
            ) : (
              <p>No sections parsed yet.</p>
            )}
          </div>
          {downloadComponent}
        </div>
      </div>
    </div>
  );
};
