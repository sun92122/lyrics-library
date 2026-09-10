import { useState, useEffect } from "react";
import type { SongData, LineItem } from "@/content.config";
import {
  type ProOptions,
  type ProFormat,
  getProFormat,
  getProFile,
} from "@/utils/propresenterFormatter";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";

import { LyricsModalOptions } from "@/components/LyricsModalOptions";
import { LyricsModalPreview } from "@/components/LyricsModalPreview";

import { proPresenterExportModalOpen, flow } from "@/stores/settings";
import { useStore } from "@nanostores/react";

interface LyricsModalProps {
  song: SongData;
}

export const LyricsModal: React.FC<LyricsModalProps> = ({ song }) => {
  const isOpen = useStore(proPresenterExportModalOpen);
  const currentFlow = useStore(flow);
  const [options, setOptions] = useState<ProOptions>({});

  const [proFormat, setProFormat] = useState<ProFormat | null>(null);

  const onClose = () => {
    proPresenterExportModalOpen.set(false);
  };

  const handleGenerateProFormat = () => {
    const generatedFormat = getProFormat(song, options, currentFlow);
    setProFormat(generatedFormat);
  };

  const handleDownload = () => {
    if (!proFormat) {
      console.error("ProFormat is not generated yet.");
      return;
    }
    const proFile = getProFile(proFormat);
    if (!proFile) {
      console.error("Failed to generate ProPresenter file.");
      return;
    }
    const blob = new Blob([proFile], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.meta.title.a}.pro`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    handleGenerateProFormat(); // Generate ProFormat on initial render
  }, [song, currentFlow, options]);

  // two columns: left for options, right for preview, with small screen is top for options, bottom for preview
  // options: <LyricsModalOptions options={options} setOptions={setOptions} />
  // preview: <LyricsModalPreview proFormat={proFormat} />
  return (
    <>
      <Dialog open={isOpen} onClose={() => onClose()} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="flex w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-lg">
            <div className="flex w-full min-h-[50vh] max-h-[90vh] overflow-hidden max-md:overflow-y-scroll thin-scrollbar flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200">
              <div className="max-md:flex-shrink-0 w-full md:w-1/2 min-w-0 overflow-x-hidden overflow-y-auto thin-scrollbar">
                <div className="sticky top-0 text-lg font-bold mb-4 py-2 max-md:pb-1 pl-8 md:pl-2 md:border-b border-gray-300 text-gray-700/80 bg-white/80 backdrop-blur-sm z-[1000]">
                  選項
                </div>
                <LyricsModalOptions options={options} setOptions={setOptions} />
              </div>
              <div className="max-md:flex-shrink-0 w-full md:w-1/2 min-w-0 overflow-x-hidden">
                <div className="sticky top-0 text-lg font-bold mb-4 py-2 max-md:pb-1 pl-8 md:pl-2 md:border-b border-gray-300 text-gray-700/80 bg-white/80 backdrop-blur-sm z-[1000]">
                  預覽
                </div>
                <div className="px-2 w-fit mx-auto overflow-y-auto thin-scrollbar">
                  {(proFormat && (
                    <LyricsModalPreview proFormat={proFormat} />
                  )) || (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      沒有歌詞或未產生 ProPresenter 格式
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-shrink-0 justify-end gap-2 border-t p-2">
              <button
                onClick={() => onClose()}
                className="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400 mr-auto"
              >
                關閉
              </button>
              <button
                onClick={handleGenerateProFormat}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                刷新預覽
              </button>
              <button
                onClick={handleDownload}
                className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
              >
                下載 .pro
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
};
