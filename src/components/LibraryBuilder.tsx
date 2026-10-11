import React, { useState, useMemo, useEffect, useRef } from "react";
import type { SongWithId, LibraryData } from "@/content.config";
import {
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Copy,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  AlertCircle,
  FileCode,
  UploadCloud,
  Upload,
  CheckCircle2,
  X,
} from "lucide-react";
import { Input } from "@headlessui/react";

export interface LibraryBuilderProps {
  availableSongs: SongWithId[];
}

interface LibrarySong {
  type?: "song" | "separator" | "note" | "header";
  id?: string;
  content?: string;
}

export type LibraryValidationResult =
  | { success: true; data: LibraryData; rawId?: string }
  | { success: false; error: string };

export function validateLibraryData(raw: unknown): LibraryValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { success: false, error: "檔案內容必須為 JSON 物件" };
  }

  const obj = raw as Record<string, any>;

  if (obj.sections && Array.isArray(obj.sections)) {
    return {
      success: false,
      error:
        "此檔案為單曲歌詞檔案而非歌曲庫檔案，請至「歌詞檔案建立工具」進行編輯",
    };
  }

  if (!obj.meta || typeof obj.meta !== "object" || Array.isArray(obj.meta)) {
    return { success: false, error: "缺少歌庫中繼資料 (meta)" };
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
    return { success: false, error: "缺少歌庫名稱 (meta.title.a)" };
  }

  if (!obj.songs || !Array.isArray(obj.songs)) {
    return { success: false, error: "缺少歌庫曲目清單 (songs)" };
  }

  for (let idx = 0; idx < obj.songs.length; idx++) {
    const item = obj.songs[idx];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { success: false, error: `第 ${idx + 1} 個項目格式無效` };
    }
    const hasValidType = ["song", "separator", "note", "header"].includes(
      item.type,
    );
    const hasId = typeof item.id === "string" && item.id.trim().length > 0;
    if (!hasValidType && !hasId) {
      return {
        success: false,
        error: `第 ${idx + 1} 個項目缺少有效的歌曲 ID 或項目類型 (type)`,
      };
    }
  }

  const normalizedSongs: LibrarySong[] = obj.songs.map((item: any) => {
    const res: LibrarySong = {};
    if (item.type) res.type = item.type;
    if (typeof item.id === "string") res.id = item.id.trim();
    if (typeof item.content === "string") res.content = item.content;
    return res;
  });

  const parsedTags = Array.isArray(obj.meta.tags)
    ? obj.meta.tags
        .filter((t: any) => typeof t === "string" && t.trim())
        .map((t: string) => t.trim())
    : [];

  const rawId = typeof obj.id === "string" ? obj.id.trim() : undefined;

  return {
    success: true,
    rawId,
    data: {
      meta: {
        title: {
          a: titleObj.a.trim(),
          b: typeof titleObj.b === "string" ? titleObj.b.trim() : "",
        },
        description:
          typeof obj.meta.description === "string" ? obj.meta.description : "",
        tags: parsedTags,
        date: obj.meta.date ? new Date(obj.meta.date) : undefined,
      },
      songs: normalizedSongs,
    },
  };
}

export const LibraryBuilder: React.FC<LibraryBuilderProps> = ({
  availableSongs,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Form State
  const [libraryId, setLibraryId] = useState("new-library");
  const [titleA, setTitleA] = useState("");
  const [titleB, setTitleB] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedSongItems, setSelectedSongItems] = useState<LibrarySong[]>([]);
  const [editingItemIndexs, setEditingItemIndex] = useState<number[]>([]);

  const [copied, setCopied] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef<number>(0);

  const loadLibraryFile = (
    data: LibraryData,
    rawId?: string,
    fileName?: string,
  ) => {
    const fileId = fileName ? fileName.replace(/\.[^/.]+$/, "") : "";
    const nextId = rawId || fileId || "my-library";

    setLibraryId(nextId);
    setTitleA(data.meta.title.a || "");
    setTitleB(data.meta.title.b || "");
    setDescription(data.meta.description || "");
    setTagsInput((data.meta.tags || []).join(", "));
    setSelectedSongItems(data.songs || []);
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
          message: `檔案「${file.name}」無法解析為 JSON 格式，請確認是否為正確的歌曲庫 JSON 檔案。`,
        });
        return;
      }

      const validation = validateLibraryData(json);
      if (!validation.success) {
        setFeedback({
          type: "error",
          message: `檔案「${file.name}」不是合法的歌曲庫檔案：${validation.error}`,
        });
        return;
      }

      loadLibraryFile(validation.data, validation.rawId, file.name);
      setFeedback({
        type: "success",
        message: `已成功載入歌曲庫「${validation.data.meta.title.a}」內容（來源：${file.name}），已覆蓋當前內容！`,
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

  // Map song ID to song data
  const songMap = useMemo(() => {
    return new Map(availableSongs.map((s) => [s.id, s]));
  }, [availableSongs]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const newTags = new Set<string>();
    const tags = new Set<string>();
    availableSongs.forEach((s) =>
      s.meta.tags.forEach((t) => {
        newTags.has(t) ? tags.add(t) : newTags.add(t);
      }),
    );
    return Array.from(tags);
  }, [availableSongs]);

  // Filter left column songs
  const filteredCatalog = useMemo(() => {
    return availableSongs.filter((song) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        song.id.toLowerCase().includes(q) ||
        song.meta.title.a.toLowerCase().includes(q) ||
        (song.meta.title.b && song.meta.title.b.toLowerCase().includes(q)) ||
        (song.meta.author && song.meta.author.toLowerCase().includes(q));

      const matchesTag = !selectedTag || song.meta.tags.includes(selectedTag);

      return matchesQuery && matchesTag;
    });
  }, [availableSongs, searchQuery, selectedTag]);

  // Toggle selection
  const toggleSong = (id: string) => {
    if (selectedSongItems.some((it) => it.id === id)) {
      setSelectedSongItems(selectedSongItems.filter((it) => it.id !== id));
    } else {
      setSelectedSongItems([...selectedSongItems, { id }]);
    }
  };

  // Get song index in selectedSongItems
  const getSongIndex = (id: string) => {
    // skip non-song items
    let index = 1;
    for (const item of selectedSongItems) {
      if (item.id === id) {
        return index;
      }
      if (item.id) {
        index++;
      }
    }
    return 0;
  };

  // Select all visible
  const selectAllVisible = () => {
    const newIds = new Set(selectedSongItems);
    filteredCatalog.forEach((s) => newIds.add({ id: s.id }));
    setSelectedSongItems(Array.from(newIds));
  };

  // Deselect all
  const clearSelection = () => {
    setSelectedSongItems([]);
  };

  // Reorder
  const moveSong = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedSongItems.length) return;
    const nextList = [...selectedSongItems];
    const temp = nextList[index];
    nextList[index] = nextList[newIndex];
    nextList[newIndex] = temp;
    setSelectedSongItems(nextList);
  };

  // Remove single song
  const removeSong = (id: string) => {
    setSelectedSongItems(selectedSongItems.filter((it) => it.id !== id));
  };

  // Remove single item by index
  const removeItemByIndex = (index: number) => {
    setSelectedSongItems(selectedSongItems.filter((_, i) => i !== index));
  };

  // Build JSON object
  const generatedJson = useMemo(() => {
    const parsedTags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      id: libraryId.trim() || "my-library",
      meta: {
        title: {
          a: titleA.trim() || "未命名歌庫",
          ...(titleB.trim() ? { b: titleB.trim() } : {}),
        },
        ...(description.trim() ? { description: description.trim() } : {}),
        tags: parsedTags,
      },
      songs: selectedSongItems,
    };
  }, [libraryId, titleA, titleB, description, tagsInput, selectedSongItems]);

  const jsonString = useMemo(() => {
    return JSON.stringify(generatedJson, null, 2);
  }, [generatedJson]);

  // Validation
  const isValid = Boolean(
    libraryId.trim() && titleA.trim() && selectedSongItems.length > 0,
  );

  // Copy JSON
  const handleCopyJson = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(jsonString);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = jsonString;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          (
            document as unknown as { execCommand: (cmd: string) => boolean }
          ).execCommand("copy");
        } catch {
          // ignore
        }
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  // Download JSON file
  const handleDownloadJson = () => {
    const fileName = `${libraryId.trim() || "library"}.json`;
    const blob = new Blob([jsonString], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ItemEditComponents = (index: number) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => moveSong(index, "up")}
        disabled={index === 0}
        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 transition-colors"
        title="上移"
      >
        <ArrowUp className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => moveSong(index, "down")}
        disabled={index === selectedSongItems.length - 1}
        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 transition-colors"
        title="下移"
      >
        <ArrowDown className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => removeItemByIndex(index)}
        className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors ml-1"
        title="自歌庫移除"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
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
                釋放以載入歌曲庫檔案
              </h3>
              <p className="text-sm text-slate-500">
                支援合法的歌曲庫 JSON 檔案，載入後將覆蓋當前內容以供修改
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>自動填入歌庫名稱、曲目清單、分類標籤與排序</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner Guide */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>維護者視覺化工具</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            歌曲庫產生器 (Library Builder)
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            挑選曲目並調整排序，或直接拖曳歌曲庫 JSON 檔案載入編輯。一鍵下載符合
            Schema 規範的 JSON 檔案，直接放入專案{" "}
            <code className="text-amber-300 font-mono text-xs">
              src/content/libraries/
            </code>{" "}
            目錄即可發起 GitHub PR！
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all shadow-sm active:scale-95"
          >
            <Upload className="w-4 h-4 text-indigo-400" />
            <span>匯入歌庫 JSON</span>
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            disabled={!isValid}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95"
            } ${
              isValid
                ? ""
                : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>已複製 JSON</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>複製 JSON</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            disabled={!isValid}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 ${
              isValid
                ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>下載 {libraryId || "library"}.json</span>
          </button>
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

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Song Catalog Selector (5 cols on lg) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>挑選歌曲 ({availableSongs.length})</span>
            </h2>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                選取全部
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-slate-500 hover:text-slate-700"
              >
                清除勾選
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋詩歌歌名、ID 或作者..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                  selectedTag === null
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                全部
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTag(selectedTag === tag ? null : tag)
                  }
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                    selectedTag === tag
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Song list with checkboxes */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredCatalog.map((song) => {
              const isSelected = selectedSongItems.some(
                (it) => it.id === song.id,
              );
              return (
                <div
                  key={song.id}
                  onClick={() => toggleSong(song.id)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all select-none ${
                    isSelected
                      ? "bg-indigo-50/60 border-indigo-200 text-indigo-950"
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-indigo-600 flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        {song.meta.title.a}
                      </div>
                      <div className="text-xs text-slate-400">
                        {song.meta.title.b || song.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {song.meta.originalKey && (
                      <span className="font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">
                        {song.meta.originalKey}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Library Metadata & Ordered Selection (6 cols on lg) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Metadata Form */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              歌庫設定與中英資訊
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  歌庫 ID (檔名 / Slug) *
                </label>
                <input
                  type="text"
                  value={libraryId}
                  onChange={(e) => setLibraryId(e.target.value)}
                  placeholder="例: classic-hymns"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  分類標籤 (以逗號分隔)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="例: 敬拜, 詩歌, 聖誕"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  中文歌庫名稱 (Title A) *
                </label>
                <input
                  type="text"
                  value={titleA}
                  onChange={(e) => setTitleA(e.target.value)}
                  placeholder="例: 經典傳統聖詩"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  英文歌庫名稱 (Title B)
                </label>
                <input
                  type="text"
                  value={titleB}
                  onChange={(e) => setTitleB(e.target.value)}
                  placeholder="例: Classic Hymns"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                歌庫詳細描述 (Description)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例: 主日崇拜常用傳統聖詩集合，適用於各類禮拜排程..."
                rows={2}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
              />
            </div>
          </div>

          {/* Selected Ordered Songs */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  收錄歌曲與排序 (
                  {selectedSongItems.filter((it) => it.id).length})
                </h3>
                <p className="text-xs text-slate-400">
                  點擊上下箭頭調整歌庫中曲目的排列先後順序
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{showJsonPreview ? "隱藏 JSON" : "檢視 JSON"}</span>
              </button>
            </div>

            {selectedSongItems.length > 0 && (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {selectedSongItems.map((item, index) => {
                  if (item.type === "separator") {
                    return (
                      <div
                        key={`separator-${index}`}
                        className="flex items-center gap-3 my-6"
                      >
                        <div className="h-px flex-1 bg-gray-200"></div>

                        <span className="shrink-0 text-sm font-medium text-gray-500">
                          分隔線
                        </span>

                        <div className="h-px flex-1 bg-gray-200"></div>

                        <div className="shrink-0 flex items-center mr-3">
                          {ItemEditComponents(index)}
                        </div>
                      </div>
                    );
                  } else if (item.type === "header") {
                    return (
                      <div
                        key={`header-${index}`}
                        className="flex items-center justify-between px-3"
                      >
                        <Input
                          value={item.content || ""}
                          onChange={(e) => {
                            const newItems = [...selectedSongItems];
                            newItems[index].content = e.target.value;
                            setSelectedSongItems(newItems);
                          }}
                          placeholder="請輸入標題內容..."
                          className="w-full py-2 bg-transparent text-md ring-0 focus:outline-none placeholder:text-gray-400 placeholder:italic font-bold"
                        />

                        {ItemEditComponents(index)}
                      </div>
                    );
                  } else if (item.type === "note") {
                    return (
                      <div
                        key={`note-${index}`}
                        className="flex items-center justify-between px-3"
                      >
                        <Input
                          value={item.content || ""}
                          onChange={(e) => {
                            const newItems = [...selectedSongItems];
                            newItems[index].content = e.target.value;
                            setSelectedSongItems(newItems);
                          }}
                          placeholder="請輸入備註內容..."
                          className="w-full py-2 bg-transparent text-md ring-0 focus:outline-none placeholder:text-gray-400 placeholder:italic placeholder:text-sm"
                        />
                        {ItemEditComponents(index)}
                      </div>
                    );
                  }
                  if (!item.id) return null; // Skip if no ID
                  const song = songMap.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-mono text-xs font-bold flex items-center justify-center">
                          {getSongIndex(item.id)}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {song ? song.meta.title.a : item.id}
                          </div>
                          {song && song.meta.title.b && (
                            <div className="text-[11px] text-slate-400">
                              {song.meta.title.b}
                            </div>
                          )}
                        </div>
                      </div>

                      {ItemEditComponents(index)}
                    </div>
                  );
                })}
              </div>
            )}
            {!selectedSongItems.some((it) => it.id) && (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                請由歌曲列表勾選歌曲以加入此歌庫
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 border-dashed text-sm">
              {/* add separator, title, description */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSongItems([
                      ...selectedSongItems,
                      { type: "separator" },
                    ])
                  }
                  className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 text-xs font-medium transition-colors"
                >
                  分隔線
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSongItems([
                      ...selectedSongItems,
                      { type: "header", content: "" },
                    ])
                  }
                  className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 text-xs font-medium transition-colors"
                >
                  標題
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSongItems([
                      ...selectedSongItems,
                      { type: "note", content: "" },
                    ])
                  }
                  className="px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 text-xs font-medium transition-colors"
                >
                  備註
                </button>
              </div>
              <span className="text-xs text-slate-400">
                加入分隔線、標題或備註以整理歌庫內容
              </span>
            </div>

            {/* Validation warnings */}
            {!isValid && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-amber-800 text-xs border border-amber-200/60">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>
                  請確保輸入歌庫 ID、中文歌庫名稱，並至少勾選收錄 1 首歌曲。
                </span>
              </div>
            )}

            {/* JSON preview */}
            {showJsonPreview && (
              <div className="mt-4 p-4 bg-slate-900 rounded-2xl text-slate-200 font-mono text-xs overflow-x-auto max-h-[300px]">
                <pre>{jsonString}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
