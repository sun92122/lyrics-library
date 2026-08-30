import React, { useEffect } from 'react';
import { CHROMATIC_SCALE } from '@/constants/keys';
import { transposeKey, getSemitoneOffset, normalizeNote } from '@/utils/transposer';
import { RotateCcw, ArrowDown, ArrowUp, Music2 } from 'lucide-react';

export interface KeyControllerProps {
  originalKey?: string;
  currentKey: string;
  onKeyChange: (newKey: string) => void;
  className?: string;
}

export const KeyController: React.FC<KeyControllerProps> = ({
  originalKey = 'C',
  currentKey,
  onKeyChange,
  className = '',
}) => {
  const semitoneOffset = getSemitoneOffset(originalKey, currentKey);
  const isOriginal = normalizeNote(currentKey) === normalizeNote(originalKey);

  // Sync to URL query param (?key=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (isOriginal) {
      if (url.searchParams.has('key')) {
        url.searchParams.delete('key');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } else {
      if (url.searchParams.get('key') !== currentKey) {
        url.searchParams.set('key', currentKey);
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, [currentKey, isOriginal]);

  const handleStep = (step: number) => {
    const nextKey = transposeKey(currentKey, step);
    onKeyChange(nextKey);
  };

  const handleReset = () => {
    onKeyChange(originalKey);
  };

  const handleSelectKey = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onKeyChange(e.target.value);
  };

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2.5 p-2 bg-slate-900/90 text-white rounded-xl shadow-lg border border-slate-700/60 backdrop-blur-md ${className}`}
    >
      <div className="flex items-center gap-2 pl-2 pr-1">
        <Music2 className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          調性 Key
        </span>
      </div>

      <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
        <span className="text-lg font-bold text-amber-400 font-mono min-w-[28px] text-center">
          {currentKey}
        </span>
        {semitoneOffset !== 0 && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
            {semitoneOffset > 0 ? `+${semitoneOffset}` : semitoneOffset}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label="降半音"
          title="降半音 (-1)"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white transition-all border border-slate-700"
        >
          <span className="font-bold text-sm">♭</span>
          <ArrowDown className="w-3 h-3 ml-0.5" />
        </button>

        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label="升半音"
          title="升半音 (+1)"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white transition-all border border-slate-700"
        >
          <span className="font-bold text-sm">♯</span>
          <ArrowUp className="w-3 h-3 ml-0.5" />
        </button>

        <select
          value={normalizeNote(currentKey)}
          onChange={handleSelectKey}
          aria-label="選擇調性"
          className="h-8 px-2 bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
        >
          {CHROMATIC_SCALE.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        {!isOriginal && (
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
        )}
      </div>
    </div>
  );
};
