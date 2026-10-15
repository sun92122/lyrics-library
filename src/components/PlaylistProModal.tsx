import React, { useState } from "react";
import type { SongWithId } from "@/content.config";
import type { PlaylistItem } from "@/utils/playlistEncoder";
import {
  type ProOptions,
  getProFormat,
  getProFile,
} from "@/utils/propresenterFormatter";
import { downloadZip, type ZipFileEntry } from "@/utils/zip";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { LyricsModalOptions } from "@/components/LyricsModalOptions";
import {
  Download,
  FolderArchive,
  FileDown,
  X,
  AlertCircle,
  Music,
  Check,
  Loader2,
  Layers,
} from "lucide-react";
import {
  FLOW_STYLE,
  getFlowName,
  EX_FLOWS,
  type FlowMapping,
} from "@/constants/flow";

export interface PlaylistSongItem {
  item: PlaylistItem;
  song: SongWithId;
  index: number;
}

export interface PlaylistProModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlistTitle?: string;
  playlistDate?: string;
  songs: PlaylistSongItem[];
}

export const PlaylistProModal: React.FC<PlaylistProModalProps> = ({
  isOpen,
  onClose,
  playlistTitle,
  playlistDate,
  songs,
}) => {
  // Shared export options across all songs in the playlist
  const [options, setOptions] = useState<ProOptions>({});
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingSingleId, setDownloadingSingleId] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Download a single song as .pro file
  const handleDownloadSingle = (entry: PlaylistSongItem) => {
    try {
      setDownloadingSingleId(entry.song.id);
      const proFormat = getProFormat(entry.song, options, entry.item.flow);
      if (!proFormat) {
        throw new Error(`無法產生 ${entry.song.meta.title.a} 的 ProFormat。`);
      }
      const proFile = getProFile(proFormat);
      if (!proFile) {
        throw new Error(
          `無法產生 ${entry.song.meta.title.a} 的 ProPresenter 檔案。`,
        );
      }

      const blob = new Blob([proFile], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.song.meta.title.a}.pro`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification(`已下載 ${entry.song.meta.title.a}.pro`);
    } catch (err: any) {
      console.error(err);
      showNotification(err?.message || "下載失敗，請稍後再試。", true);
    } finally {
      setDownloadingSingleId(null);
    }
  };

  // Download all songs bundled in a ZIP archive
  const handleDownloadAllZip = async () => {
    if (songs.length === 0) return;

    try {
      setDownloadingZip(true);
      const zipEntries: ZipFileEntry[] = [];
      const failedSongs: string[] = [];

      for (let i = 0; i < songs.length; i++) {
        const entry = songs[i];
        try {
          const proFormat = getProFormat(entry.song, options, entry.item.flow);
          const proFile = getProFile(proFormat);
          const filename = `${String(entry.index + 1).padStart(2, "0")} - ${entry.song.meta.title.a}.pro`;

          zipEntries.push({
            name: filename,
            data: proFile as Uint8Array,
          });
        } catch (songErr) {
          console.error(
            `Error formatting song ${entry.song.meta.title.a}:`,
            songErr,
          );
          failedSongs.push(entry.song.meta.title.a);
        }
      }

      if (zipEntries.length === 0) {
        throw new Error("沒有成功產生的 ProPresenter 檔案。");
      }

      const cleanTitle = (playlistTitle || "敬拜歌單").replace(
        /[\\/:*?"<>|]/g,
        "_",
      );
      const cleanDate = playlistDate
        ? `_${playlistDate.replace(/[\\/:*?"<>|]/g, "_")}`
        : "";
      const zipFilename = `${cleanTitle}${cleanDate}.zip`;

      downloadZip(zipEntries, zipFilename);

      if (failedSongs.length > 0) {
        showNotification(
          `已下載 ${zipEntries.length} 首詩歌壓縮檔，其中 ${failedSongs.join(", ")} 產生失敗。`,
          true,
        );
      } else {
        showNotification(
          `已成功下載全部 ${zipEntries.length} 首詩歌壓縮檔 (${zipFilename})！`,
        );
      }
    } catch (err: any) {
      console.error("Failed to generate ZIP:", err);
      showNotification(err?.message || "產生壓縮檔失敗，請重試。", true);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Download all songs sequentially as individual .pro files
  const handleDownloadAllIndividual = async () => {
    if (songs.length === 0) return;

    try {
      setDownloadingAll(true);
      let successCount = 0;

      for (let i = 0; i < songs.length; i++) {
        const entry = songs[i];
        try {
          const proFormat = getProFormat(entry.song, options, entry.item.flow);
          const proFile = getProFile(proFormat);

          const blob = new Blob([proFile], {
            type: "application/octet-stream",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${entry.song.meta.title.a}.pro`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          successCount++;
        } catch (songErr) {
          console.error(
            `Error downloading song ${entry.song.meta.title.a}:`,
            songErr,
          );
        }

        // Slight pause between browser download triggers to prevent browser throttling
        if (i < songs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      showNotification(`已完成逐一下載 ${successCount} 首詩歌！`);
    } catch (err: any) {
      console.error("Individual downloads failed:", err);
      showNotification(err?.message || "下載過程中發生錯誤。", true);
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Positioning */}
      <div className="fixed inset-0 flex w-screen items-center justify-center p-3 sm:p-4">
        <DialogPanel className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[92vh] border border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FolderArchive className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>下載 ProPresenter 檔案</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    共 {songs.length} 首詩歌
                  </span>
                </DialogTitle>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>歌單：{playlistTitle || "主日敬拜歌單"}</span>
                  {playlistDate && (
                    <>
                      <span>•</span>
                      <span>日期：{playlistDate}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Documentation Alert Banner */}
          <div className="px-6 pt-3 pb-1">
            <div className="p-3 bg-rose-50/90 border border-rose-200/90 rounded-xl text-xs text-rose-900 flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">必讀說明：</span>
                使用此功能前請閱讀{" "}
                <a
                  href="/docs/prop"
                  className="text-blue-600 font-bold hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  .pro 輸出說明
                </a>
                ，以便在 ProPresenter 中正確套用字體與主題。歌單內所有曲目將
                <strong>共用</strong>下方設定的輸出規格。
              </div>
            </div>
          </div>

          {/* Notification Banners */}
          {successMessage && (
            <div className="mx-6 mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="mx-6 mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Body Columns: Left = Shared Options, Right = Song List */}
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-hidden flex-1 min-h-[40vh] max-h-[65vh]">
            {/* Left Column: Shared Download Options */}
            <div className="w-full md:w-1/2 overflow-y-auto thin-scrollbar p-6 space-y-4">
              <div className="sticky top-0 bg-white/90 backdrop-blur-xs pb-2 border-b border-slate-100 flex items-center justify-between z-10">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>通用下載設定（所有曲目共用）</span>
                </span>
                <span className="text-[11px] text-slate-400">已自動套用</span>
              </div>

              <div className="-ml-6">
                <LyricsModalOptions options={options} setOptions={setOptions} />
              </div>
            </div>

            {/* Right Column: Songs included in playlist */}
            <div className="w-full md:w-1/2 overflow-y-auto thin-scrollbar p-6 space-y-3 bg-slate-50/40">
              <div className="sticky top-0 bg-slate-50/90 backdrop-blur-xs pb-2 border-b border-slate-200 flex items-center justify-between z-10">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-indigo-600" />
                  <span>歌單曲目清單</span>
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  共 {songs.length} 首
                </span>
              </div>

              {songs.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  歌單中沒有可匯出的詩歌曲目
                </div>
              ) : (
                <div className="space-y-2.5">
                  {songs.map((entry) => {
                    const { song, item, index } = entry;
                    const isDownloadingThis = downloadingSingleId === song.id;
                    const songKey = item.k || song.meta.originalKey || "C";
                    const flow = item.flow || [];
                    const customFlow = item.customFlow || [];

                    return (
                      <div
                        key={`${song.id}-${index}`}
                        className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-indigo-200 transition-all flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {index + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {song.meta.title.a}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                              <span className="font-mono text-indigo-600 font-medium">
                                Key: {songKey}
                              </span>
                              {song.meta.title.b && (
                                <span className="text-slate-400 truncate max-w-[120px]">
                                  {song.meta.title.b}
                                </span>
                              )}
                              {flow.length > 0 && (
                                <span className="text-slate-400">
                                  • {flow.length} 個流程段落
                                </span>
                              )}
                            </div>

                            {/* Flow Chips Preview */}
                            {flow.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {flow.slice(0, 5).map((tagId, tIdx) => {
                                  const tag =
                                    tagId < (song.sections.length || 0)
                                      ? song.sections[tagId].name
                                      : tagId <
                                          (song.sections.length || 0) +
                                            EX_FLOWS.length
                                        ? EX_FLOWS[
                                            tagId - (song.sections.length || 0)
                                          ]
                                        : (customFlow?.[
                                            tagId -
                                              (song.sections.length || 0) -
                                              EX_FLOWS.length
                                          ] ?? "?");

                                  return (
                                    <span
                                      key={tIdx}
                                      className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
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
                                    </span>
                                  );
                                })}
                                {flow.length > 5 && (
                                  <span className="text-[10px] text-slate-400">
                                    +{flow.length - 5}...
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Single Song Download Action */}
                        <button
                          type="button"
                          onClick={() => handleDownloadSingle(entry)}
                          disabled={isDownloadingThis}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex-shrink-0 disabled:opacity-50"
                          title={`下載 ${song.meta.title.a}.pro`}
                        >
                          {isDownloadingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                          ) : (
                            <FileDown className="w-3.5 h-3.5" />
                          )}
                          <span>.pro</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-200 bg-slate-50/70">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all active:scale-95 shadow-2xs mr-auto"
            >
              關閉
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadAllIndividual}
                disabled={
                  downloadingAll || downloadingZip || songs.length === 0
                }
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95 shadow-2xs disabled:opacity-50 disabled:pointer-events-none"
                title="逐一下載歌單內所有歌曲的 .pro 檔案"
              >
                {downloadingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>正在下載全部檔案...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5 text-slate-500" />
                    <span>逐一下載全部 (.pro)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={
                  downloadingZip || downloadingAll || songs.length === 0
                }
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                title="將歌單內所有 .pro 檔案打包成 ZIP 壓縮檔下載"
              >
                {downloadingZip ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在打包壓縮檔...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>打包下載全部 (.zip)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
