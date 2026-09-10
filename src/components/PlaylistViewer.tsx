import React, { useState, useEffect, useMemo } from "react";
import type { SongWithId } from "@/content.config";
import {
  FLOW_STYLE,
  FLOW_ALIASES,
  FLOW_NAMES,
  EX_FLOWS,
  getFlowName,
  type FlowMapping,
} from "@/constants/flow";
import { getSemitoneOffset } from "@/utils/transposer";
import {
  decodePlaylist,
  formatPlaylistOutline,
  type PlaylistPayload,
} from "@/utils/playlistEncoder";
import {
  Calendar,
  Music,
  Share2,
  Check,
  ArrowRight,
  Sparkles,
  Layers,
  Edit3,
  MessageSquare,
  FileText,
} from "lucide-react";

export interface PlaylistViewerProps {
  availableSongs: SongWithId[];
}

export const PlaylistViewer: React.FC<PlaylistViewerProps> = ({
  availableSongs,
}) => {
  const [payload, setPayload] = useState<PlaylistPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedOutline, setCopiedOutline] = useState(false);
  const [currentHash, setCurrentHash] = useState("");

  // Map song ID to song data
  const songMap = useMemo(() => {
    return new Map(availableSongs.map((s) => [s.id, s]));
  }, [availableSongs]);

  // Decode hash on mount and hashchange
  useEffect(() => {
    const parseHash = () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      setCurrentHash(hash);

      if (hash.startsWith("#data=")) {
        const encoded = hash.slice(6);
        const decoded = decodePlaylist(encoded);
        setPayload(decoded);
      } else {
        setPayload(null);
      }
      setLoading(false);
    };

    parseHash();
    window.addEventListener("hashchange", parseHash);
    return () => window.removeEventListener("hashchange", parseHash);
  }, []);

  // Copy share URL
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = window.location.href;
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
    if (!payload) return;

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

    const outline = formatPlaylistOutline(payload, outlineMap);

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

  if (loading) {
    return <div className="p-12 text-center text-slate-400">載入歌單中...</div>;
  }

  if (!payload || !payload.s || payload.s.length === 0) {
    return (
      <div className="p-12 sm:p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-6 max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
          <Music className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">無活動歌單資料</h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            目前網址中尚未包含編碼後的歌單資訊。您可以立即使用歌單產生器挑選曲目並產生活動歌單分享連結！
          </p>
        </div>

        <div className="pt-2">
          <a
            href="/tools/playlist-builder"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>前往歌單產生器建立歌單</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs uppercase tracking-wider">
              <Layers className="w-4 h-4" />
              <span>Playlist</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {payload.t || "主日敬拜歌單"}
            </h1>

            {payload.d && (
              <div className="flex items-center gap-2 text-sm text-slate-500 font-medium pt-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{payload.d}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`/tools/playlist-builder${currentHash}`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border border-slate-200 active:scale-95"
              title="載入此歌單至產生器進行編輯"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>編輯歌單</span>
            </a>

            <button
              type="button"
              onClick={handleCopyOutline}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border shadow-sm ${
                copiedOutline
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 active:scale-95"
              }`}
            >
              {copiedOutline ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>已複製大綱</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>複製通知大綱</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                copiedLink
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95"
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>已複製連結</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>分享歌單網址</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
          <span>共收錄 {payload.s.length} 首詩歌流程</span>
          <span className="text-slate-400">
            點擊曲目直接開啟即時調性歌詞與和弦
          </span>
        </div>
      </div>

      {/* Playlist Timeline Items */}
      <div className="space-y-4">
        {payload.s.map((item, index) => {
          const song = songMap.get(item.id);
          const customKey = item.k || song?.meta.originalKey || "C";
          const originalKey = song?.meta.originalKey || customKey;
          const semitoneOffset = getSemitoneOffset(originalKey, customKey);
          const flow = item.flow || [];
          const customFlow = item.customFlow || [];

          const songUrl =
            `/songs/${item.id}?playlist=${encodeURIComponent(currentHash.slice(6))}` +
            `#${encodeURIComponent(customKey)}---${flow.join(",")}---${encodeURIComponent(customFlow.join(","))}`;

          return (
            <div
              key={`${item.id}-${index}`}
              className="group block p-6 bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all space-y-4"
            >
              {/* Header row */}
              <a
                href={songUrl}
                className="flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <span className="w-10 h-10 rounded-2xl bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-700 font-mono text-base font-bold flex items-center justify-center transition-colors shadow-sm">
                    {index + 1}
                  </span>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {song ? song.meta.title.a : item.id}
                    </h2>
                    {song?.meta.title.b && (
                      <span className="text-xs text-slate-400 font-normal">
                        {song.meta.title.b}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-2">
                    {/* Key Badge */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold font-mono">
                      <Music className="w-3.5 h-3.5 text-amber-600" />
                      <span>Key: {customKey}</span>
                      {semitoneOffset !== 0 && (
                        <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded font-normal">
                          {semitoneOffset > 0
                            ? `+${semitoneOffset}`
                            : semitoneOffset}{" "}
                          (原 {originalKey})
                        </span>
                      )}
                    </div>
                    {song?.meta.bpm && (
                      <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold font-mono">
                        <span className="font-normal text-slate-400">BPM:</span>
                        <span>{song.meta.bpm}</span>
                      </div>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform pl-1">
                    <span>檢視</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </a>

              {/* Flow Sequence Chips */}
              {flow.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500">
                    歌序：
                  </div>
                  <div className="!mt-0 inline-block items-center">
                    {flow.map((tagId, tIndex) => {
                      const tag =
                        tagId < (song?.sections.length || 0)
                          ? song!.sections[tagId].name
                          : tagId <
                              (song?.sections.length || 0) + EX_FLOWS.length
                            ? EX_FLOWS[tagId - (song?.sections.length || 0)]
                            : (customFlow?.[
                                tagId -
                                  (song?.sections.length || 0) -
                                  EX_FLOWS.length
                              ] ?? "?");

                      return (
                        <div
                          className="mt-1 inline-block text-wrap items-center"
                          key={tIndex}
                        >
                          <span
                            className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100/80"
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
                </div>
              )}

              {/* Worship Leader / Musician Note */}
              {item.note && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-700 flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900">
                      司琴/敬拜備註：
                    </span>
                    <span className="text-slate-600 ml-1">{item.note}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
