import React, { useState, useMemo } from "react";
import type { SongData, LineItem } from "@/content.config";
import {
  FLOW_STYLE,
  getFlowName,
  getFlowTagByIndex,
  formatFlowTagName,
  getFlowColor,
  type FlowMapping,
} from "@/constants/flow";
import { getLanguageName } from "@/constants/languages";
import {
  formatLyricsText,
  type LanguageMode,
  type LayoutMode,
} from "@/utils/lyricsFormatter";
import { Copy, Check, LayoutList, AlignLeft } from "lucide-react";
import { KeyController } from "./KeyController";
import { proPresenterExportModalOpen } from "@/stores/settings";

export interface LyricsViewerProps {
  song: SongData;
  originalKey?: string;
  currentKey?: string;
  onKeyChange?: (newKey: string) => void;
  hideKeyController?: boolean;
  currentFlow?: number[];
  customFlow?: string[];
  className?: string;
  readonly?: boolean;
  ui?: {
    container?: string;
  };
}

export const LyricsViewer: React.FC<LyricsViewerProps> = ({
  song,
  originalKey,
  currentKey,
  onKeyChange,
  hideKeyController = false,
  currentFlow,
  customFlow,
  className = "",
  readonly = false,
  ui,
}) => {
  const [languageMode, setLanguageMode] = useState<LanguageMode>("both");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("segmented");
  const [copied, setCopied] = useState<boolean>(false);

  const hasLanguageB = Boolean(
    song.meta.languages.b &&
    song.sections.some((section) =>
      section.lines.some((line) => line.b && line.b.trim() !== ""),
    ),
  );
  const showInlineKeyController = Boolean(!hideKeyController && originalKey);
  const flow = useMemo(() => {
    return currentFlow && currentFlow.length > 0
      ? currentFlow
      : song.meta.arrangement;
  }, [currentFlow, song.meta.arrangement]);
  const isDefaultFlow = useMemo(() => {
    return !customFlow || customFlow.length === 0;
  }, [customFlow]);

  const handleCopy = async () => {
    const text = formatLyricsText(song, {
      languageMode,
      layoutMode,
      includeTitle: true,
    });

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
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
      console.error("Failed to copy lyrics: ", err);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Controls Bar */}
      {!readonly && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-wrap w-full items-center justify-between gap-3 p-3">
            {/* Left: Language & Layout Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Language Switcher */}
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setLanguageMode("a")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    languageMode === "a" || !hasLanguageB
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {getLanguageName(song.meta.languages.a) || "主語言"}
                </button>
                {hasLanguageB && (
                  <button
                    type="button"
                    onClick={() => setLanguageMode("both")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      languageMode === "both"
                        ? "bg-white text-indigo-600 shadow-sm font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    雙語對照
                  </button>
                )}
              </div>

              {/* Layout Mode Switcher */}
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setLayoutMode("segmented")}
                  title="分段標記模式"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    layoutMode === "segmented"
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>分段</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("continuous")}
                  title="連續流暢模式"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    layoutMode === "continuous"
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span>連續</span>
                </button>
              </div>
            </div>

            {/* Right: Key Controller, Copy & ProPresenter Export */}
            <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-start">
              {showInlineKeyController && (
                <KeyController
                  originalKey={originalKey}
                  currentKey={currentKey || originalKey || "C"}
                  onKeyChange={onKeyChange || (() => {})}
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已複製歌詞</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>　複製歌詞</span>
                    </>
                  )}
                </button>

                {/* Propresenter modal */}
                <button
                  id="pro-presenter-export-modal-button"
                  type="button"
                  onClick={() => proPresenterExportModalOpen.set(true)}
                  className="flex items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm bg-amber-500 hover:bg-amber-600 text-amber-100 active:scale-95"
                >
                  <span>ProPresenter</span>
                </button>
              </div>
            </div>
          </div>

          {flow && flow.length > 0 && (
            <div className="space-y-1.5 p-4 pt-2 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500">
                {isDefaultFlow ? "歌序" : "預設歌序"}
              </div>
              <div className="inline-block items-center !mt-0">
                {flow.map((tagIndex, tIndex) => {
                  const rawTag = getFlowTagByIndex(
                    tagIndex,
                    song?.sections,
                    customFlow,
                  );
                  if (!rawTag || rawTag === "?") return null;
                  const secondaryLanguage =
                    getLanguageName(song?.meta.languages?.b?.trim()) || "";
                  const tag = formatFlowTagName(
                    tagIndex,
                    rawTag,
                    secondaryLanguage,
                  );
                  const tagColor = getFlowColor(rawTag);

                  return (
                    <div
                      className="mt-1 inline-block text-wrap items-center"
                      key={tIndex}
                    >
                      <span
                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100/80"
                        style={{
                          backgroundColor: tagColor + "22",
                          color: tagColor,
                          borderColor: tagColor + "44",
                        }}
                      >
                        {tag}
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
        </div>
      )}

      {/* Lyrics Render Area */}
      <div
        className={
          "p-6 md:p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-8 " +
          (ui?.container || "")
        }
      >
        {song.sections.map((section, sIndex) => (
          <div key={sIndex} className="space-y-4">
            {/* Section Header (if segmented) */}
            {layoutMode === "segmented" && (
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100/80"
                  style={{
                    backgroundColor:
                      (FLOW_STYLE[section.name as keyof FlowMapping] ??
                        FLOW_STYLE["default"]) + "22",
                    color:
                      FLOW_STYLE[section.name as keyof FlowMapping] ??
                      FLOW_STYLE["default"],
                    borderColor:
                      (FLOW_STYLE[section.name as keyof FlowMapping] ??
                        FLOW_STYLE["default"]) + "44",
                  }}
                >
                  {getFlowName(section.name)}
                </span>
              </div>
            )}

            {/* Section Lines */}
            <div className="space-y-5">
              {section.lines.map((line, lIndex) => (
                <RenderLine
                  key={lIndex}
                  line={line}
                  languageMode={languageMode}
                />
              ))}
              <div style={{ fontSize: 0 }}>{"\n"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface RenderLineProps {
  line: LineItem;
  languageMode: LanguageMode;
}

const RenderLine: React.FC<RenderLineProps> = ({ line, languageMode }) => {
  return (
    <div className="flex flex-col space-y-1">
      <div className="text-slate-800 text-lg md:text-xl font-normal leading-relaxed whitespace-pre-wrap select-text">
        {line.a}
      </div>
      {languageMode === "both" && line.b && (
        <div className="text-slate-500 text-sm md:text-base font-normal leading-normal pt-0.5 whitespace-pre-line">
          {line.b}
        </div>
      )}
    </div>
  );
};