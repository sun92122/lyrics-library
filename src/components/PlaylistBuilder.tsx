import React, { useState, useMemo, useEffect } from "react";
import type { SongWithId } from "@/content/config";
import { CHROMATIC_SCALE } from "@/constants/keys";
import {
  FLOW_STYLE,
  FLOW_ALIASES,
  EX_FLOWS,
  getFlowName,
  type FlowMapping,
} from "@/constants/flow";
import {
  encodePlaylist,
  decodePlaylist,
  formatPlaylistOutline,
  type PlaylistPayload,
  type PlaylistItem,
} from "@/utils/playlistEncoder";
import {
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  Share2,
  ExternalLink,
  Calendar,
  Sparkles,
  Layers,
  FileText,
} from "lucide-react";

export interface PlaylistBuilderProps {
  availableSongs: SongWithId[];
}

export const PlaylistBuilder: React.FC<PlaylistBuilderProps> = ({
  availableSongs,
}) => {
  const [title, setTitle] = useState("主日敬拜");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PlaylistItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOutline, setCopiedOutline] = useState(false);
  const [origin, setOrigin] = useState("");

  // Map song ID to song data
  const songMap = useMemo(() => {
    return new Map(availableSongs.map((s) => [s.id, s]));
  }, [availableSongs]);

  // Load from hash if present on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      if (window.location.hash.startsWith("#data=")) {
        const encoded = window.location.hash.slice(6);
        const decoded = decodePlaylist(encoded);
        if (decoded) {
          if (decoded.t) setTitle(decoded.t);
          if (decoded.d) setDate(decoded.d);
          if (Array.isArray(decoded.s)) setItems(decoded.s);
        }
      }
    }
  }, []);

  // Filter available songs
  const filteredCatalog = useMemo(() => {
    return availableSongs.filter((song) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        song.id.toLowerCase().includes(q) ||
        song.meta.title.a.toLowerCase().includes(q) ||
        (song.meta.title.b && song.meta.title.b.toLowerCase().includes(q)) ||
        (song.meta.author && song.meta.author.toLowerCase().includes(q));

      return matchesQuery;
    });
  }, [availableSongs, searchQuery]);

  // Add song to playlist
  const addSong = (song: SongWithId) => {
    const newItem: PlaylistItem = {
      id: song.id,
      k: song.meta.originalKey,
      flow: [],
      note: "",
      customFlow: [],
    };
    setItems([...items, newItem]);
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Move item
  const moveItem = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    const temp = nextItems[index];
    nextItems[index] = nextItems[targetIndex];
    nextItems[targetIndex] = temp;
    setItems(nextItems);
  };

  // Update item field
  const updateItem = (index: number, updates: Partial<PlaylistItem>) => {
    setItems(items.map((it, i) => (i === index ? { ...it, ...updates } : it)));
  };

  // Toggle flow tag for an item
  const toggleFlowTag = (index: number, tag: number) => {
    const it = items[index];
    const currentFlow = it.flow || [];
    const nextFlow = [...currentFlow, tag];
    updateItem(index, { flow: nextFlow });
  };

  // Add a custom flow tag for an item
  const addCustomFlowTag = (index: number, tag: string) => {
    const it = items[index];
    const currentCustomFlow = it.customFlow || [];
    if (!currentCustomFlow.includes(tag)) {
      const nextCustomFlow = [...currentCustomFlow, tag];
      updateItem(index, { customFlow: nextCustomFlow });
    }
  };

  // Remove a specific flow tag instance
  const removeFlowTagAt = (itemIndex: number, tagIndex: number) => {
    const it = items[itemIndex];
    const nextFlow = (it.flow || []).filter((_, i) => i !== tagIndex);
    updateItem(itemIndex, { flow: nextFlow });
  };

  // Encode payload
  const encodedData = useMemo(() => {
    const payload: PlaylistPayload = {
      t: title.trim() || "敬拜歌單",
      ...(date.trim() ? { d: date.trim() } : {}),
      s: items,
    };
    return encodePlaylist(payload);
  }, [title, date, items]);

  const shareUrl = `${origin}/playlist#data=${encodedData}`;

  // Copy share URL
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
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
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  // Copy outline text
  const handleCopyOutline = async () => {
    const outlineMap = new Map<
      string,
      { titleA: string; titleB?: string; originalKey?: string }
    >();
    availableSongs.forEach((s) => {
      outlineMap.set(s.id, {
        titleA: s.meta.title.a,
        titleB: s.meta.title.b,
        originalKey: s.meta.originalKey,
      });
    });

    const outline = formatPlaylistOutline(
      { t: title, d: date, s: items },
      outlineMap,
    );

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(outline);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = outline;
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
      setCopiedOutline(true);
      setTimeout(() => setCopiedOutline(false), 2000);
    } catch (err) {
      console.error("Failed to copy outline: ", err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Playlist Builder</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            產生敬拜歌單
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            挑選詩歌、自訂個別調性、排定段落流程（e.g., V1 ➔ C ➔ V2 ➔ C ➔
            Tag）與司琴備註
            <br />
            所有資料直接壓縮於分享網址中，無需註冊或資料庫即可隨發隨用！
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4">
          <button
            type="button"
            onClick={handleCopyOutline}
            disabled={items.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              copiedOutline
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 active:scale-95"
            }`}
          >
            {copiedOutline ? (
              <>
                <Check className="w-4 h-4" />
                <span>已複製通訊大綱</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-slate-400" />
                <span>複製通知大綱</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            disabled={items.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 ${
              copiedLink
                ? "bg-emerald-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
            }`}
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4" />
                <span>已複製分享連結</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>複製歌單短網址</span>
              </>
            )}
          </button>

          {items.length > 0 && (
            <a
              href={`/playlist#data=${encodedData}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md transition-all active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              <span>直接預覽歌單</span>
            </a>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Song Catalog (5 cols on lg) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>挑選曲目庫 ({availableSongs.length})</span>
            </h2>
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

          {/* Song list with Add button */}
          <div
            className="space-y-2 max-h-96 overflow-y-auto pr-1"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(148,163,184,0.5) transparent",
            }}
          >
            {filteredCatalog.map((song) => (
              <div
                key={song.id}
                className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:bg-slate-50 transition-all group"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-row gap-2 items-baseline">
                    <div className="font-semibold text-sm text-slate-900">
                      {song.meta.title.a}
                    </div>
                    <div className="text-xs text-slate-400">
                      {song.meta.title.b || song.id}
                    </div>
                  </div>
                  <div className="flex flex-row gap-2 items-baseline">
                    {song.meta.author && (
                      <div className="text-[11px] text-slate-400">
                        {song.meta.author}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {song.meta.originalKey && (
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">
                      {song.meta.originalKey}
                    </span>
                  )}
                  {song.meta.bpm && (
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">
                      {song.meta.bpm} BPM
                    </span>
                  )}

                  {items.some((it) => it.id === song.id) ? (
                    <button
                      type="button"
                      onClick={() => addSong(song)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white text-xs font-semibold transition-all active:scale-95 shadow-sm group"
                    >
                      <Check className="group-hover:hidden w-3.5 h-3.5" />
                      <span className="group-hover:hidden w-9">已加入</span>
                      <Plus className="hidden group-hover:block w-3.5 h-3.5" />
                      <span className="hidden group-hover:block w-9">再加</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addSong(song)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-semibold transition-all active:scale-95 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="w-9">加入</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Playlist Arrangement (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Activity Info Inputs */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">活動基本資訊</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  活動 / 聚會名稱 (Title)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 2026-08-30 主日敬拜"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  日期 (Date)
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Ordered Playlist Items */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  敬拜曲目編排 ({items.length})
                </h3>
                <p className="text-xs text-slate-400">
                  配置每首詩歌的指定調性、流程排程與敬拜備註
                </p>
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                >
                  清空歌單
                </button>
              )}
            </div>

            {items.length > 0 ? (
              <div className="space-y-4">
                {items.map((item, index) => {
                  const song = songMap.get(item.id);
                  const flow = item.flow || [];
                  const customFlowTags = item.customFlow || [];

                  return (
                    <div
                      key={`${item.id}-${index}`}
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3"
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-mono text-xs font-bold flex items-center justify-center shadow-sm">
                            {index + 1}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {song ? song.meta.title.a : item.id}
                            </div>
                            {song?.meta.title.b && (
                              <div className="text-[11px] text-slate-400">
                                {song.meta.title.b}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reorder and Delete controls */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveItem(index, "up")}
                            disabled={index === 0}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                            title="上移"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => moveItem(index, "down")}
                            disabled={index === items.length - 1}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                            title="下移"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors ml-1"
                            title="自歌單移除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Settings row: Custom Key & Flow */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 border-t border-slate-200/60">
                        {/* Key select */}
                        <div className="sm:col-span-4 flex items-center gap-2">
                          <label className="text-xs font-medium text-slate-500 whitespace-nowrap">
                            Key:
                          </label>
                          <select
                            value={item.k || song?.meta.originalKey || "-"}
                            onChange={(e) =>
                              updateItem(index, { k: e.target.value })
                            }
                            className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono text-amber-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="-">-</option>
                            {CHROMATIC_SCALE.map((k) => (
                              <option key={k} value={k}>
                                {k} {song?.meta.originalKey === k ? "(原)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Note input */}
                        <div className="sm:col-span-8">
                          <input
                            type="text"
                            value={item.note || ""}
                            onChange={(e) =>
                              updateItem(index, { note: e.target.value })
                            }
                            placeholder="備註（例: 開頭由鋼琴引導由弱漸強）..."
                            className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Flow Builder */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">
                            歌序
                          </span>
                          <span className="text-[11px] text-slate-400 ml-auto mr-1">
                            段落：
                          </span>
                          <div className="flex flex-wrap max-w-[80%] w-full items-center gap-1">
                            {song?.sections.map((preset, presetIndex) => {
                              const tag = getFlowName(preset.name);
                              const tagIndex = presetIndex;
                              return (
                                <button
                                  key={`tag-${tagIndex}`}
                                  type="button"
                                  onClick={() =>
                                    toggleFlowTag(index, presetIndex)
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
                              const tagIndex =
                                presetIndex + (song?.sections.length || 0);
                              return (
                                <button
                                  key={`tag-${tagIndex}`}
                                  type="button"
                                  onClick={() =>
                                    toggleFlowTag(
                                      index,
                                      presetIndex +
                                        (song?.sections.length || 0),
                                    )
                                  }
                                  className="whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                                >
                                  {tag}
                                </button>
                              );
                            })}
                            {/* custom tags input */}
                            {customFlowTags.map((tag, tagIndex) => (
                              <button
                                key={`custom-tag-${tagIndex}`}
                                type="button"
                                onClick={() =>
                                  toggleFlowTag(
                                    index,
                                    tagIndex +
                                      (song?.sections.length || 0) +
                                      EX_FLOWS.length,
                                  )
                                }
                                className="whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                              >
                                {tag}
                              </button>
                            ))}
                            <input
                              type="text"
                              placeholder="other..."
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  e.currentTarget.value
                                ) {
                                  const newTag = e.currentTarget.value.trim();
                                  if (
                                    newTag &&
                                    !customFlowTags.includes(newTag)
                                  ) {
                                    addCustomFlowTag(index, newTag);
                                  }
                                  e.currentTarget.value = "";
                                }
                              }}
                              className="flex-shrink-0 w-[6ic] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {/* Flow badges sequence */}
                        {flow.length > 0 ? (
                          <>
                            <div className="w-full inline-block items-center !mt-1 px-2 pt-1 pb-2 bg-white rounded-xl border border-slate-200/80 min-h-[36px]">
                              {flow.map((tagIndex, tIndex) => {
                                const tag =
                                  tagIndex < (song?.sections.length || 0)
                                    ? song!.sections[tagIndex].name
                                    : tagIndex <
                                        (song?.sections.length || 0) +
                                          EX_FLOWS.length
                                      ? EX_FLOWS[
                                          tagIndex -
                                            (song?.sections.length || 0)
                                        ]
                                      : customFlowTags[
                                          tagIndex -
                                            (song?.sections.length || 0) -
                                            EX_FLOWS.length
                                        ] || "?";
                                return (
                                  <div
                                    className="mt-1 inline-block text-wrap items-center"
                                    key={tIndex}
                                  >
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-100"
                                      style={{
                                        backgroundColor:
                                          (FLOW_STYLE[
                                            tag as keyof FlowMapping
                                          ] ?? FLOW_STYLE["default"]) + "22",
                                        color:
                                          FLOW_STYLE[
                                            tag as keyof FlowMapping
                                          ] ?? FLOW_STYLE["default"],
                                        borderColor:
                                          (FLOW_STYLE[
                                            tag as keyof FlowMapping
                                          ] ?? FLOW_STYLE["default"]) + "44",
                                      }}
                                    >
                                      {getFlowName(tag)}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeFlowTagAt(index, tIndex)
                                        }
                                        className="hover:text-rose-600 transition-colors ml-0.5 select-none"
                                      >
                                        ×
                                      </button>
                                    </span>
                                    {tIndex < flow.length - 1 && (
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
                                onClick={() => updateItem(index, { flow: [] })}
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
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                請由曲目庫點擊「加入」編排您的敬拜歌單
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
