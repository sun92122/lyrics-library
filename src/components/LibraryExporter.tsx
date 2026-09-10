import React, { useState } from "react";
import type { SongData, LibraryWithId } from "@/content.config";
import { formatLyricsText } from "@/utils/lyricsFormatter";
import { Copy, Check, Download } from "lucide-react";

export interface LibraryExporterProps {
  library: LibraryWithId;
  songs: SongData[];
}

export const LibraryExporter: React.FC<LibraryExporterProps> = ({
  library,
  songs,
}) => {
  const [copied, setCopied] = useState(false);

  const generateFullText = (): string => {
    const lines: string[] = [];
    lines.push(`========================================`);
    lines.push(
      `歌庫：${library.meta.title.a}${library.meta.title.b ? ` (${library.meta.title.b})` : ""}`,
    );
    if (library.meta.description) {
      lines.push(`簡介：${library.meta.description}`);
    }
    lines.push(`收錄曲目共 ${songs.length} 首`);
    lines.push(`========================================\n`);

    songs.forEach((song, index) => {
      lines.push(`----------------------------------------`);
      lines.push(
        `[${index + 1}] ${song.meta.title.a}${song.meta.title.b ? ` / ${song.meta.title.b}` : ""}`,
      );
      if (song.meta.author) lines.push(`詞曲：${song.meta.author}`);
      if (song.meta.originalKey) lines.push(`原調：${song.meta.originalKey}`);
      lines.push(`----------------------------------------`);

      const text = formatLyricsText(song, {
        languageMode: "both",
        layoutMode: "segmented",
        includeTitle: false,
      });

      lines.push(text);
      lines.push("\n");
    });

    return lines.join("\n").trim();
  };

  const handleCopy = async () => {
    const fullText = generateFullText();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = fullText;
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
      console.error("Failed to copy full library lyrics: ", err);
    }
  };

  const handleDownload = () => {
    const fullText = generateFullText();
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${library.id}-lyrics.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all shadow-sm ${
          copied
            ? "bg-emerald-600 text-white"
            : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 active:scale-95"
        }`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>已複製整本歌詞</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            <span>複製整本歌詞</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>下載純文字檔 (.txt)</span>
      </button>
    </div>
  );
};
