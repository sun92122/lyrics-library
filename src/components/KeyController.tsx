import React, { useEffect, useRef } from "react";
import {
  transposeKey,
  getSemitoneOffset,
  normalizeNote,
} from "@/utils/transposer";
import { RotateCcw, ArrowDown, ArrowUp } from "lucide-react";

export interface KeyControllerProps {
  originalKey?: string;
  currentKey: string;
  onKeyChange: (newKey: string) => void;
  className?: string;
}

export const KeyController: React.FC<KeyControllerProps> = ({
  originalKey = "C",
  currentKey,
  onKeyChange,
  className = "",
}) => {
  const semitoneOffset = getSemitoneOffset(originalKey, currentKey);
  const isOriginal = normalizeNote(currentKey) === normalizeNote(originalKey);
  const didMountRef = useRef(false);

  // Sync to URL query param (?key=...) after initial mount so SSR/hydration never clears ?key=
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

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
    } else if (url.searchParams.get("key") !== currentKey) {
      url.searchParams.set("key", currentKey);
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [currentKey, isOriginal]);

  const handleStep = (step: number) => {
    const nextKey = transposeKey(currentKey, step);
    onKeyChange(nextKey);
  };

  const handleReset = () => {
    onKeyChange(originalKey);
  };

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 backdrop-blur-md ${className}`}
    >
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

        <div className="flex items-center justify-center gap-1 min-w-[3.5rem] px-1">
          <span className="text-lg font-bold text-amber-600 font-mono min-w-[28px] text-center">
            {currentKey}
          </span>
          {semitoneOffset !== 0 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-mono">
              {semitoneOffset > 0 ? `+${semitoneOffset}` : semitoneOffset}
            </span>
          )}
        </div>

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

        {!isOriginal && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="重設原調"
            title={`回復原調 (${originalKey})`}
            className="flex items-center gap-1 h-7 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium transition-all border border-amber-200 active:scale-95"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">原調</span>
          </button>
        )}
      </div>
    </div>
  );
};