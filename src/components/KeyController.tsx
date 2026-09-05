import React, { useEffect } from "react";
import { CHROMATIC_SCALE } from "@/constants/keys";
import {
  transposeKey,
  getSemitoneOffset,
  normalizeNote,
} from "@/utils/transposer";
import {
  RotateCcw,
  ArrowDown,
  ArrowUp,
  Music2,
  Eye,
  EyeOff,
} from "lucide-react";

export interface KeyControllerProps {
  showChords: boolean;
  setShowChords: (show: boolean) => void;
  originalKey?: string;
  currentKey: string;
  onKeyChange: (newKey: string) => void;
  className?: string;
}

export const KeyController: React.FC<KeyControllerProps> = ({
  showChords,
  setShowChords,
  originalKey = "C",
  currentKey,
  onKeyChange,
  className = "",
}) => {
  const semitoneOffset = getSemitoneOffset(originalKey, currentKey);
  const isOriginal = normalizeNote(currentKey) === normalizeNote(originalKey);

  // Sync to URL query param (?key=...)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (isOriginal) {
      if (url.searchParams.has("key")) {
        url.searchParams.delete("key");
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    } else {
      if (url.searchParams.get("key") !== currentKey) {
        url.searchParams.set("key", currentKey);
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    }
  }, [currentKey, isOriginal]);

  const handleStep = (step: number) => {
    const nextKey = transposeKey(currentKey, step);
    onKeyChange(nextKey);
  };

  // not used
  const handleReset = () => {
    onKeyChange(originalKey);
  };

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2.5 backdrop-blur-md ${className}`}
    >
      <button
        type="button"
        onClick={() => setShowChords(!showChords)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
          showChords
            ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
            : "bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100"
        }`}
      >
        {showChords ? (
          <>
            <Music2 className="w-3.5 h-3.5 text-amber-600" />
            <span>顯示和弦</span>
          </>
        ) : (
          <>
            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            <span>隱藏和弦</span>
          </>
        )}
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label="降半音"
          title="降半音 (-1)"
          className="flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all bg-slate-50 border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          <span className="font-bold text-sm">♭</span>
          <ArrowDown className="w-3 h-3" />
        </button>

        <div className="flex items-center justify-center gap-1 w-14 max-[500px]:w-12">
          <span className="text-lg font-bold text-amber-600 font-mono min-w-[28px] text-center">
            {currentKey}
          </span>
          {semitoneOffset !== 0 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-mono">
              {semitoneOffset > 0 ? `+${semitoneOffset}` : semitoneOffset}
            </span>
          )}
        </div>

        {/* {!isOriginal && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="重設原調"
            title={`重設原調 (${originalKey})`}
            className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-all border border-amber-500/40 active:scale-95"
          >
            <RotateCcw className="w-3 h-3" />
            <span>原調</span>
          </button>
        )} */}

        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label="升半音"
          title="升半音 (+1)"
          className="flex items-center justify-center w-7 h-7 rounded-lg active:scale-95 transition-all bg-slate-50 border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          <span className="font-bold text-sm">♯</span>
          <ArrowUp className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
