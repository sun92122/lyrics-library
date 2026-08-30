import React, { useState, useMemo } from 'react';
import type { SongData, LineItem } from '@/content/config';
import { transposeChord, getSemitoneOffset } from '@/utils/transposer';
import {
  formatLyricsText,
  getSectionTitle,
  type LanguageMode,
  type LayoutMode,
} from '@/utils/lyricsFormatter';
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  LayoutList,
  AlignLeft,
} from 'lucide-react';

export interface LyricsViewerProps {
  song: SongData;
  currentKey: string;
  className?: string;
}

export const LyricsViewer: React.FC<LyricsViewerProps> = ({
  song,
  currentKey,
  className = '',
}) => {
  const [languageMode, setLanguageMode] = useState<LanguageMode>('a');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('segmented');
  const [showChords, setShowChords] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const semitoneOffset = useMemo(() => {
    return getSemitoneOffset(song.meta.originalKey || 'C', currentKey);
  }, [song.meta.originalKey, currentKey]);

  const hasLanguageB = Boolean(song.meta.languages.b && song.meta.title.b);

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
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          (document as unknown as { execCommand: (cmd: string) => boolean }).execCommand('copy');
        } catch {
          // ignore
        }
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy lyrics: ', err);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Left: Language & Layout Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Language Switcher */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-medium">
            <button
              type="button"
              onClick={() => setLanguageMode('a')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                languageMode === 'a'
                  ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {song.meta.languages.a || '主語言'}
            </button>
            {hasLanguageB && (
              <>
                <button
                  type="button"
                  onClick={() => setLanguageMode('b')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    languageMode === 'b'
                      ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {song.meta.languages.b || '次語言'}
                </button>
                <button
                  type="button"
                  onClick={() => setLanguageMode('both')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    languageMode === 'both'
                      ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  雙語對照
                </button>
              </>
            )}
          </div>

          {/* Layout Mode Switcher */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-medium">
            <button
              type="button"
              onClick={() => setLayoutMode('segmented')}
              title="分段標記模式"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                layoutMode === 'segmented'
                  ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>分段模式</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('continuous')}
              title="連續流暢模式"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                layoutMode === 'continuous'
                  ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span>連續模式</span>
            </button>
          </div>
        </div>

        {/* Right: Chords Toggle & Copy Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChords(!showChords)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              showChords
                ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {showChords ? (
              <>
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span>顯示和弦</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>隱藏和弦</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
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
                <span>複製歌詞</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Lyrics Render Area */}
      <div className="p-6 md:p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-8">
        {song.sections.map((section, sIndex) => (
          <div key={sIndex} className="space-y-4">
            {/* Section Header (if segmented) */}
            {layoutMode === 'segmented' && (
              <div className="flex items-center gap-2 pt-2 border-b border-slate-100 pb-2">
                <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {getSectionTitle(section)}
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
                  showChords={showChords}
                  semitoneOffset={semitoneOffset}
                />
              ))}
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
  showChords: boolean;
  semitoneOffset: number;
}

const RenderLine: React.FC<RenderLineProps> = ({
  line,
  languageMode,
  showChords,
  semitoneOffset,
}) => {
  // If in pure language 'b' mode without language 'a'
  if (languageMode === 'b') {
    return (
      <div className="text-slate-800 text-lg leading-relaxed font-sans">
        {line.b || line.a}
      </div>
    );
  }

  // Parse characters for language 'a'
  const primaryChars = Array.from(line.a || '');
  const chords = line.chords || [];

  // Find max index needed for chords (including trailing chords)
  const maxChordIndex = chords.reduce((max, c) => Math.max(max, c.index), -1);
  const totalSlots = Math.max(primaryChars.length, maxChordIndex + 1);

  // Map chord index to chord item
  const chordMap = new Map<number, string>();
  chords.forEach((c) => {
    const transposed = transposeChord(c.chord, semitoneOffset);
    chordMap.set(c.index, transposed);
  });

  return (
    <div className="flex flex-col space-y-1">
      {/* Primary Line with Anchored Chords */}
      <div className="flex flex-wrap items-end leading-none select-text">
        {Array.from({ length: totalSlots }).map((_, index) => {
          const char = primaryChars[index] ?? '';
          const chord = chordMap.get(index);
          const isTrailingSpacer = index >= primaryChars.length;

          return (
            <div
              key={index}
              className={`inline-flex flex-col items-start justify-end flex-shrink-0 ${
                isTrailingSpacer ? 'min-w-[2.2rem]' : ''
              }`}
            >
              {/* Chord Slot */}
              {showChords && (
                <div className="h-5 flex items-center pr-1 min-w-[1ch]">
                  {chord ? (
                    <span className="font-mono text-sm font-bold text-amber-600 hover:text-amber-700 bg-amber-50/80 px-1 py-0.5 rounded leading-none">
                      {chord}
                    </span>
                  ) : (
                    <span className="invisible text-xs select-none leading-none">_</span>
                  )}
                </div>
              )}

              {/* Character Slot */}
              <div className="text-slate-800 text-lg md:text-xl font-normal leading-relaxed">
                {char || (isTrailingSpacer ? <span className="inline-block w-4">&nbsp;</span> : '')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary Language Subtitle (if enabled) */}
      {languageMode === 'both' && line.b && (
        <div className="text-slate-500 text-sm md:text-base font-normal leading-normal pt-0.5">
          {line.b}
        </div>
      )}
    </div>
  );
};
