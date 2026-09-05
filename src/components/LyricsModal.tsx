import { useState, useEffect } from "react";
import type { SongData, LineItem } from "@/content/config";
import {
  type ProOptions,
  type ProFormat,
  getProFormat,
  getProFile,
} from "@/utils/propresenterFormatter";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";

import { LyricsModalOptions } from "@/components/LyricsModalOptions";
import { LyricsModalPreview } from "@/components/LyricsModalPreview";

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: SongData;
  flow?: number[];
}

export const LyricsModal: React.FC<LyricsModalProps> = ({
  isOpen,
  onClose,
  song,
  flow,
}) => {
  if (!isOpen) return null;

  const [options, setOptions] = useState<ProOptions>({});

  const [proFormat, setProFormat] = useState<ProFormat | null>(null);

  const handleGenerateProFormat = () => {
    const generatedFormat = getProFormat(song, options, flow);
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

  const handleOptionsChange = (newOptions: ProOptions) => {
    setOptions(newOptions);
    handleGenerateProFormat(); // Regenerate ProFormat whenever options change
  };

  useEffect(() => {
    handleGenerateProFormat(); // Generate ProFormat on initial render
  }, [song, flow, options]);

  // two columns: left for options, right for preview, with small screen is top for options, bottom for preview
  // options: <LyricsModalOptions options={options} setOptions={setOptions} />
  // preview: <LyricsModalPreview proFormat={proFormat} />
  return (
    <>
      <Dialog open={isOpen} onClose={() => onClose()} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="flex w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-lg">
            <div className="flex w-full min-h-[50vh] max-h-[90vh] flex-col gap-4 overflow-hidden md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200">
              <div className="w-full md:w-1/2 min-w-0 overflow-x-hidden overflow-y-auto p-4">
                <LyricsModalOptions />
              </div>
              <div className="w-full md:w-1/2 min-w-0 overflow-x-hidden overflow-y-auto p-4">
                {(proFormat && (
                  <LyricsModalPreview proFormat={proFormat} />
                )) || (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    沒有歌詞或未產生 ProPresenter 格式
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t p-4">
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
                產生 ProPresenter 格式
              </button>
              <button
                onClick={handleDownload}
                className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
              >
                下載 ProPresenter 檔案
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
};
