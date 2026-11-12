import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Music2 } from "lucide-react";
import type { SongData } from "@/content.config";
import type { ScoreViewMode } from "@/lib/dolce-bridge/runtime";
import { LyricsViewer } from "./LyricsViewer";
import { KeyController } from "./KeyController";
import { flow } from "@/stores/settings";

const DolceScoreViewport = React.lazy(() => import("./DolceScoreViewport"));

export interface SongViewContainerProps {
  song: SongData;
}

type MainTab = ScoreViewMode | "lyrics";

const SCORE_TABS: readonly { id: MainTab; label: string }[] = [
  { id: "original", label: "簡譜" },
  { id: "staff", label: "五線譜" },
  { id: "mixed", label: "混排" },
  { id: "expanded", label: "投影" },
  { id: "lyrics", label: "歌詞" },
];

export const SongViewContainer: React.FC<SongViewContainerProps> = ({
  song,
}) => {
  const metaOriginalKey = song.meta.originalKey?.trim() || undefined;
  const [detectedScoreKey, setDetectedScoreKey] = useState<string | undefined>(
    undefined,
  );
  const effectiveOriginalKey = metaOriginalKey || detectedScoreKey || "C";

  const [currentKey, setCurrentKey] = useState<string | undefined>(
    metaOriginalKey || (song.score ? "C" : undefined),
  );
  const [currentFlow, setCurrentFlow] = useState<number[] | undefined>(
    undefined,
  );
  const [customFlow, setCustomFlow] = useState<string[] | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<MainTab>(
    song.score ? (song.score.defaultView ?? "original") : "lyrics",
  );

  const hasExplicitKeyRef = useRef(false);

  useEffect(() => {
    const syncFromLocation = () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;

      // #{key}---{flow}---{customFlow}
      const match = hash.match(/#([^#]+)---([^#]*)---([^#]*)/);
      if (match) {
        const keyParam = decodeURIComponent(match[1] ?? "").trim();
        const flowParam = match[2] ?? undefined;
        const customFlowParam = match[3] ?? undefined;

        if (keyParam) {
          hasExplicitKeyRef.current = true;
          setCurrentKey(keyParam);
        }
        if (customFlowParam) {
          setCustomFlow(decodeURIComponent(customFlowParam).split(","));
        }
        if (flowParam) {
          const flowArray = flowParam
            .split(",")
            .map((tag) => parseInt(tag, 10))
            .filter((tag) => !isNaN(tag));
          setCurrentFlow(flowArray.length > 0 ? flowArray : undefined);
          flow.set(flowArray.length > 0 ? flowArray : undefined);
        }
        return;
      }

      const queryKey = new URLSearchParams(window.location.search)
        .get("key")
        ?.trim();
      if (queryKey) {
        hasExplicitKeyRef.current = true;
        setCurrentKey(queryKey);
      }
    };

    syncFromLocation();
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, []);

  const handleUserKeyChange = useCallback((nextKey: string) => {
    hasExplicitKeyRef.current = true;
    setCurrentKey(nextKey);
  }, []);

  const handleDetectedOriginalKey = useCallback(
    (detected: string) => {
      setDetectedScoreKey(detected);
      if (!metaOriginalKey && !hasExplicitKeyRef.current) {
        setCurrentKey(detected);
      }
    },
    [metaOriginalKey],
  );

  // Lyric-only fast path: zero Dolce imports or styles loaded
  if (!song.score) {
    return (
      <div className="space-y-6">
        <LyricsViewer
          song={song}
          originalKey={metaOriginalKey}
          currentKey={currentKey}
          onKeyChange={handleUserKeyChange}
          currentFlow={currentFlow}
          customFlow={customFlow}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Unified Score Tabs + Key Controller Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <div
          role="tablist"
          aria-label="樂譜與歌詞檢視模式"
          className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-medium gap-0.5"
        >
          {SCORE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-white text-indigo-600 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.id === "lyrics" ? (
                  <FileText className="w-3.5 h-3.5" />
                ) : (
                  <Music2 className="w-3.5 h-3.5" />
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <KeyController
          originalKey={effectiveOriginalKey}
          currentKey={currentKey || effectiveOriginalKey}
          onKeyChange={handleUserKeyChange}
        />
      </div>

      {/* Main Content View */}
      {activeTab === "lyrics" ? (
        <LyricsViewer
          song={song}
          originalKey={effectiveOriginalKey}
          currentKey={currentKey}
          onKeyChange={handleUserKeyChange}
          hideKeyController={true}
          currentFlow={currentFlow}
          customFlow={customFlow}
        />
      ) : (
        <Suspense
          fallback={
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm py-20 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span>正在載入樂譜引擎…</span>
            </div>
          }
        >
          <DolceScoreViewport
            score={song.score}
            originalKey={effectiveOriginalKey}
            currentKey={currentKey}
            onDetectedOriginalKey={handleDetectedOriginalKey}
            viewMode={activeTab}
            onViewModeChange={setActiveTab}
            hideViewTabs={true}
          />
        </Suspense>
      )}
    </div>
  );
};