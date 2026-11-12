import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Square,
  Timer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { SongScore } from "@/content.config";
import type { Diagnostic, ScoreDoc } from "@/lib/dolce/model/doc";
import {
  parseScoreDoc,
  type ScoreViewMode,
} from "@/lib/dolce-bridge/runtime";
import {
  extractEffectiveKey,
  renderScoreSession,
} from "@/lib/dolce-bridge/transpose";
import type { ScorePainter } from "@/lib/dolce/layout/painter";
import {
  ScorePlayer,
  anchorSeconds,
  timelineSeconds,
  type PlayState,
} from "@/lib/dolce/editor/player";
import { playSourceOf } from "@/lib/dolce/jianpu/playsong";
import {
  SPEED_STEPS,
  type PlaySource,
  type Timeline,
} from "@/lib/dolce/score/timeline";
import { getSemitoneOffset } from "@/utils/transposer";
import "../styles/dolce-viewport.css";

export const VIEW_MODE_OPTIONS: readonly {
  id: ScoreViewMode;
  label: string;
}[] = [
  { id: "original", label: "簡譜" },
  { id: "staff", label: "五線譜" },
  { id: "mixed", label: "混排" },
  { id: "expanded", label: "投影" },
];

export interface DolceScoreViewportProps {
  score: SongScore;
  originalKey?: string;
  currentKey?: string;
  onDetectedOriginalKey?: (detectedKey: string) => void;
  initialView?: ScoreViewMode;
  viewMode?: ScoreViewMode;
  onViewModeChange?: (view: ScoreViewMode) => void;
  hideViewTabs?: boolean;
  heightClass?: string;
  className?: string;
}

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.85;
const ZOOM_STEP = 0.15;

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const DolceScoreViewport: React.FC<DolceScoreViewportProps> = ({
  score,
  originalKey,
  currentKey,
  onDetectedOriginalKey,
  initialView,
  viewMode,
  onViewModeChange,
  hideViewTabs = false,
  heightClass = "",
  className = "",
}) => {
  const [internalView, setInternalView] = useState<ScoreViewMode>(
    initialView ?? score.defaultView ?? "original",
  );
  const activeView = viewMode ?? internalView;

  const setActiveView = (next: ScoreViewMode) => {
    if (viewMode === undefined) {
      setInternalView(next);
    }
    onViewModeChange?.(next);
  };

  // Sync uncontrolled initial view if score.defaultView changes (e.g. new OMR run)
  useEffect(() => {
    if (viewMode === undefined && score.defaultView) {
      setInternalView(score.defaultView);
    }
  }, [score.defaultView, viewMode]);

  const [detectedKey, setDetectedKey] = useState<string | undefined>(undefined);
  const [zoom, setZoom] = useState<number>(1);
  const [rendering, setRendering] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [renderedPages, setRenderedPages] = useState<
    { svg: SVGSVGElement; size: { w: number; h: number } }[]
  >([]);

  const [playState, setPlayState] = useState<PlayState>("stopped");
  const [playError, setPlayError] = useState<string | null>(null);
  const [hasPlayableNotes, setHasPlayableNotes] = useState<boolean>(false);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);
  const [loopOn, setLoopOn] = useState<boolean>(false);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(false);
  const [showRemaining, setShowRemaining] = useState<boolean>(false);

  const painterRef = useRef<ScorePainter | null>(null);
  const renderedDocRef = useRef<ScoreDoc | null>(null);
  const playerRef = useRef<ScorePlayer | null>(null);
  const playSrcRef = useRef<PlaySource | null>(null);
  const tlCacheRef = useRef<{
    src: PlaySource;
    speed: number;
    tl: Timeline;
    spq: number;
  } | null>(null);
  const cueSecRef = useRef<number | null>(null);
  const draggingRef = useRef<boolean>(false);
  const progressRef = useRef<HTMLInputElement | null>(null);
  const speedRef = useRef<number>(speed);
  speedRef.current = speed;
  const loopOnRef = useRef<boolean>(loopOn);
  loopOnRef.current = loopOn;
  const metronomeOnRef = useRef<boolean>(metronomeOn);
  metronomeOnRef.current = metronomeOn;
  const durationRef = useRef<number>(durationSec);
  durationRef.current = durationSec;

  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastHighlightedPageRef = useRef<number | null>(null);
  const onDetectedKeyRef = useRef(onDetectedOriginalKey);
  onDetectedKeyRef.current = onDetectedOriginalKey;

  const getTimeline = useCallback((src: PlaySource, spd: number) => {
    const cached = tlCacheRef.current;
    if (cached && cached.src === src && cached.speed === spd) return cached;
    try {
      const { tl, spq } = timelineSeconds(src, { speed: spd });
      const next = { src, speed: spd, tl, spq };
      tlCacheRef.current = next;
      return next;
    } catch {
      return null;
    }
  }, []);

  // Detect original key from score in browser (DOMParser safe)
  useEffect(() => {
    if (typeof window === "undefined" || !score.content.trim()) {
      setDetectedKey(undefined);
      return;
    }
    try {
      const parsed = parseScoreDoc(score.format, score.content);
      const eff = extractEffectiveKey(parsed);
      setDetectedKey(eff);
      if (eff) {
        onDetectedKeyRef.current?.(eff);
      }
    } catch {
      setDetectedKey(undefined);
    }
  }, [score.format, score.content]);

  const baseKey = originalKey?.trim() || detectedKey || "C";
  const effectiveTargetKey = currentKey?.trim() || baseKey;
  const semitones = getSemitoneOffset(baseKey, effectiveTargetKey);

  // Lazy ScorePlayer lifecycle (no AudioContext created until user clicks Play)
  useEffect(() => {
    const player = new ScorePlayer(
      (id, pass, occ) => {
        const painter = painterRef.current;
        if (!painter) return;
        const pageIdx = painter.highlight(id, pass, occ);
        if (
          id !== null &&
          pageIdx !== null &&
          pageIdx !== lastHighlightedPageRef.current
        ) {
          lastHighlightedPageRef.current = pageIdx;
          pageContainerRefs.current[pageIdx]?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        } else if (id === null) {
          lastHighlightedPageRef.current = null;
        }
      },
      (nextState) => {
        setPlayState(nextState);
        if (nextState === "stopped") {
          lastHighlightedPageRef.current = null;
          setCurrentTimeSec(cueSecRef.current ?? 0);
        } else if (nextState === "paused") {
          setCurrentTimeSec(player.position);
        }
      },
      (pos) => {
        if (!draggingRef.current) {
          setCurrentTimeSec(pos);
        }
      },
    );
    playerRef.current = player;

    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, []);

  // Engrave & mount SVG pages on score/semitones/view change
  useEffect(() => {
    let cancelled = false;

    const cleanupCurrent = () => {
      cueSecRef.current = null;
      draggingRef.current = false;
      playerRef.current?.stop();
      lastHighlightedPageRef.current = null;
      playSrcRef.current = null;
      tlCacheRef.current = null;
      if (painterRef.current) {
        painterRef.current.dispose();
        painterRef.current = null;
      }
      renderedDocRef.current = null;
    };

    cleanupCurrent();
    setPlayError(null);
    setDurationSec(0);
    setCurrentTimeSec(0);

    if (!score.content.trim()) {
      setRendering(false);
      setRenderError(null);
      setDiagnostics([]);
      setRenderedPages([]);
      setHasPlayableNotes(false);
      return () => {
        cancelled = true;
      };
    }

    setRendering(true);
    setRenderError(null);

    (async () => {
      try {
        const res = await renderScoreSession({
          format: score.format,
          content: score.content,
          semitones,
          view: activeView,
        });

        if (cancelled) {
          res.painter.dispose();
          return;
        }

        painterRef.current = res.painter;
        renderedDocRef.current = res.renderedDoc;
        setDiagnostics(res.diagnostics);

        const nextPages = res.pages.map((svg, idx) => ({
          svg,
          size: res.painter.pageSize(idx),
        }));
        setRenderedPages(nextPages);

        if (res.renderedDoc) {
          try {
            const playSrc = playSourceOf(
              res.renderedDoc,
              0,
              activeView === "staff" || activeView === "mixed"
                ? {}
                : { forExpanded: true },
            );
            playSrcRef.current = playSrc;
            setHasPlayableNotes(Boolean(playSrc));
            if (playSrc) {
              const t = getTimeline(playSrc, speedRef.current);
              setDurationSec(t ? t.tl.duration * t.spq : 0);
            } else {
              setDurationSec(0);
            }
          } catch {
            playSrcRef.current = null;
            setHasPlayableNotes(false);
            setDurationSec(0);
          }
        } else {
          playSrcRef.current = null;
          setHasPlayableNotes(false);
          setDurationSec(0);
        }
        setRendering(false);
      } catch (err) {
        if (cancelled) return;
        setRendering(false);
        setRenderedPages([]);
        setDiagnostics([]);
        playSrcRef.current = null;
        setHasPlayableNotes(false);
        setDurationSec(0);
        setRenderError(
          err instanceof Error
            ? err.message
            : "樂譜排版失敗，請檢查樂譜語法或內容。",
        );
      }
    })();

    return () => {
      cancelled = true;
      cleanupCurrent();
    };
  }, [score.format, score.content, semitones, activeView, getTimeline]);

  // Mount generated SVGSVGElements into their containers
  useEffect(() => {
    renderedPages.forEach((entry, idx) => {
      const host = pageContainerRefs.current[idx];
      if (host && host.firstChild !== entry.svg) {
        host.replaceChildren(entry.svg);
      }
    });
  }, [renderedPages]);

  const commitSeekRef = useRef<(sec: number) => Promise<void>>(async () => {});
  commitSeekRef.current = async (sec: number) => {
    const player = playerRef.current;
    const dur =
      player && (player.state === "playing" || player.state === "paused")
        ? player.duration
        : durationRef.current;
    const clamped = Math.max(0, Math.min(sec, dur));
    if (player && (player.state === "playing" || player.state === "paused")) {
      try {
        await player.seek(clamped);
        setCurrentTimeSec(clamped);
      } catch (err) {
        setPlayError(
          err instanceof Error ? err.message : "無法定位試聽進度",
        );
      }
      return;
    }
    cueSecRef.current = clamped;
    setCurrentTimeSec(clamped);
  };

  // Attach native "change" listener so scrubber commits on pointer/keyboard release (matches upstream playback.ts)
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    const handleCommit = () => {
      draggingRef.current = false;
      const val = parseFloat(el.value) || 0;
      void commitSeekRef.current(val);
    };
    el.addEventListener("change", handleCommit);
    return () => {
      el.removeEventListener("change", handleCommit);
    };
  }, [hasPlayableNotes]);

  const resolvePlaySource = (): PlaySource | null => {
    if (playSrcRef.current) return playSrcRef.current;
    const doc = renderedDocRef.current;
    if (!doc) return null;
    const src = playSourceOf(
      doc,
      0,
      activeView === "staff" || activeView === "mixed"
        ? {}
        : { forExpanded: true },
    );
    playSrcRef.current = src;
    return src;
  };

  const handlePlayToggle = async () => {
    const player = playerRef.current;
    if (!player || !renderedDocRef.current) return;
    setPlayError(null);

    try {
      if (playState === "playing") {
        player.pause();
      } else if (playState === "paused") {
        await player.resume();
      } else if (playState === "stopped") {
        const src = resolvePlaySource();
        if (!src) {
          setPlayError("此樂譜沒有可試聽的旋律或音符");
          return;
        }
        const t = getTimeline(src, speedRef.current);
        const dur = t ? t.tl.duration * t.spq : durationRef.current;
        const start = cueSecRef.current ?? 0;
        cueSecRef.current = null;
        player.setLoop(
          loopOnRef.current && dur > 0 ? { from: 0, to: dur } : null,
        );
        await player.play(
          src,
          {
            speed: speedRef.current,
            metronome: metronomeOnRef.current,
          },
          start,
        );
      }
    } catch (err) {
      setPlayError(
        err instanceof Error ? err.message : "無法啟動 Web Audio 鋼琴試聽",
      );
    }
  };

  const handleStop = () => {
    cueSecRef.current = null;
    draggingRef.current = false;
    playerRef.current?.stop();
    setCurrentTimeSec(0);
  };

  const handleSpeedChange = async (nextSpeed: number) => {
    const oldSpeed = speedRef.current;
    if (nextSpeed === oldSpeed) return;
    speedRef.current = nextSpeed;
    setSpeed(nextSpeed);

    const src = resolvePlaySource();
    const nextTl = src ? getTimeline(src, nextSpeed) : null;
    const nextDur = nextTl ? nextTl.tl.duration * nextTl.spq : 0;
    setDurationSec(nextDur);

    const player = playerRef.current;
    if (
      player &&
      (player.state === "playing" || player.state === "paused") &&
      src
    ) {
      const paused = player.state === "paused";
      const nextPos = Math.max(
        0,
        Math.min((player.position * oldSpeed) / nextSpeed, nextDur),
      );
      cueSecRef.current = nextPos;
      setCurrentTimeSec(nextPos);
      player.setLoop(
        loopOnRef.current && nextDur > 0 ? { from: 0, to: nextDur } : null,
      );
      try {
        await player.play(
          src,
          { speed: nextSpeed, metronome: metronomeOnRef.current },
          nextPos,
          paused,
        );
      } catch (err) {
        setPlayError(
          err instanceof Error ? err.message : "調整播放速度時發生錯誤",
        );
      } finally {
        cueSecRef.current = null;
      }
      return;
    }

    if (cueSecRef.current !== null) {
      const nextCue = Math.max(
        0,
        Math.min((cueSecRef.current * oldSpeed) / nextSpeed, nextDur),
      );
      cueSecRef.current = nextCue;
      setCurrentTimeSec(nextCue);
    } else {
      setCurrentTimeSec(0);
    }
  };

  const handleLoopToggle = () => {
    const next = !loopOnRef.current;
    loopOnRef.current = next;
    setLoopOn(next);
    const player = playerRef.current;
    if (player && (player.state === "playing" || player.state === "paused")) {
      const dur = player.duration || durationRef.current;
      player.setLoop(next && dur > 0 ? { from: 0, to: dur } : null);
    }
  };

  const handleMetronomeToggle = async () => {
    const next = !metronomeOnRef.current;
    metronomeOnRef.current = next;
    setMetronomeOn(next);

    const player = playerRef.current;
    const src = resolvePlaySource();
    if (
      player &&
      (player.state === "playing" || player.state === "paused") &&
      src
    ) {
      const at = player.position;
      const paused = player.state === "paused";
      const dur = player.duration || durationRef.current;
      cueSecRef.current = at;
      player.setLoop(
        loopOnRef.current && dur > 0 ? { from: 0, to: dur } : null,
      );
      try {
        await player.play(
          src,
          { speed: speedRef.current, metronome: next },
          at,
          paused,
        );
      } catch (err) {
        setPlayError(
          err instanceof Error ? err.message : "切換節拍器時發生錯誤",
        );
      } finally {
        cueSecRef.current = null;
      }
    }
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    const painter = painterRef.current;
    if (!player || !painter) return;
    const hitId = painter.noteAt(e.target as Element | null);
    if (hitId === null) return;

    if (playState === "playing" || playState === "paused") {
      const sec = player.timeOf({ id: hitId, pass: 1 });
      if (sec !== null) {
        setCurrentTimeSec(sec);
        void player.seek(sec);
      }
      return;
    }

    if (playState === "stopped") {
      const src = resolvePlaySource();
      const t = src ? getTimeline(src, speedRef.current) : null;
      if (!t) return;
      const sec = anchorSeconds(t.tl, t.spq, { id: hitId, pass: 1 });
      if (sec !== null) {
        cueSecRef.current = sec;
        setCurrentTimeSec(sec);
      }
    }
  };

  const clampedTime = Math.max(0, Math.min(currentTimeSec, durationSec));
  const timeDisplay = showRemaining
    ? `-${fmtTime(Math.max(0, durationSec - clampedTime))} / ${fmtTime(durationSec)}`
    : `${fmtTime(clampedTime)} / ${fmtTime(durationSec)}`;

  return (
    <div
      className={`bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden ${className}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 bg-slate-50/80 border-b border-slate-200/70">
        <div className="flex flex-wrap items-center gap-2">
          {!hideViewTabs && (
            <div className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl text-xs font-medium">
              {VIEW_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveView(opt.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeView === opt.id
                      ? "bg-white text-indigo-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Audio Playback Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!hasPlayableNotes || rendering || playState === "loading"}
              onClick={handlePlayToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                playState === "playing"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : playState === "paused"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-45 disabled:cursor-not-allowed"
              }`}
            >
              {playState === "loading" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>載入鋼琴音色…</span>
                </>
              ) : playState === "playing" ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>暫停試聽</span>
                </>
              ) : playState === "paused" ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>繼續試聽</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>試聽播放</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleStop}
              disabled={playState === "stopped"}
              aria-label="停止播放"
              title="停止試聽並回到曲首"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>停止</span>
            </button>

            {hasPlayableNotes && (
              <div className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200">
                <input
                  ref={progressRef}
                  type="range"
                  min={0}
                  max={durationSec > 0 ? durationSec : 1}
                  step="any"
                  value={durationSec > 0 ? clampedTime : 0}
                  disabled={rendering || durationSec <= 0 || playState === "loading"}
                  onChange={(e) => {
                    draggingRef.current = true;
                    setCurrentTimeSec(parseFloat(e.target.value) || 0);
                  }}
                  aria-label="試聽進度條"
                  className="w-24 sm:w-32 h-1.5 accent-indigo-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />

                <button
                  type="button"
                  onClick={() => setShowRemaining((v) => !v)}
                  title="點擊切換已播時間／剩餘時間"
                  aria-label="播放時間顯示"
                  className="font-mono text-[11px] tabular-nums text-slate-600 hover:text-indigo-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  {timeDisplay}
                </button>

                <span className="h-3.5 w-px bg-slate-200" aria-hidden="true" />

                <select
                  value={speed}
                  disabled={rendering || playState === "loading"}
                  onChange={(e) => {
                    void handleSpeedChange(parseFloat(e.target.value) || 1);
                  }}
                  aria-label="播放速度"
                  title="調整試聽播放速度"
                  className="bg-transparent text-xs font-medium text-slate-700 hover:text-indigo-600 focus:outline-none cursor-pointer pr-1 disabled:opacity-45"
                >
                  {SPEED_STEPS.map((v) => (
                    <option key={v} value={v}>
                      {v === 1 ? "原速" : `×${v}`}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleLoopToggle}
                  aria-pressed={loopOn}
                  title="循環播放整首樂譜"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    loopOn
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Repeat className="w-3 h-3" />
                  <span>循環</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleMetronomeToggle();
                  }}
                  disabled={playState === "loading"}
                  aria-pressed={metronomeOn}
                  title="開啟或關閉試聽節拍器"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-45 ${
                    metronomeOn
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Timer className="w-3 h-3" />
                  <span>節拍</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Diagnostics & Zoom */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {diagnostics.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>語法提醒 ({diagnostics.length})</span>
            </button>
          )}

          <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 text-xs">
            <button
              type="button"
              aria-label="縮小樂譜"
              onClick={() =>
                setZoom((z) =>
                  Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))),
                )
              }
              disabled={zoom <= ZOOM_MIN}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg disabled:opacity-40"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="重設縮放為 100%"
              className="px-1.5 font-mono text-slate-700 hover:text-indigo-600 min-w-[44px] text-center"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="放大樂譜"
              onClick={() =>
                setZoom((z) =>
                  Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))),
                )
              }
              disabled={zoom >= ZOOM_MAX}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg disabled:opacity-40"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                aria-label="重設縮放"
                onClick={() => setZoom(1)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Diagnostics Panel */}
      {showDiagnostics && diagnostics.length > 0 && (
        <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-200/70 text-xs text-amber-900 space-y-1">
          {diagnostics.slice(0, 8).map((d, idx) => (
            <div key={idx} className="font-mono">
              {d.source?.line !== undefined
                ? `第 ${d.source.line + 1} 行：`
                : ""}
              {d.message}
            </div>
          ))}
          {diagnostics.length > 8 && (
            <div className="text-amber-700">
              …還有 {diagnostics.length - 8} 則提醒
            </div>
          )}
        </div>
      )}

      {/* Playback error notice */}
      {playError && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-700">
          {playError}
        </div>
      )}

      {/* Score Pages Canvas */}
      <div
        className={`bg-slate-100/70 p-2 sm:p-4 ${heightClass} ${
          heightClass ? "overflow-y-auto" : ""
        }`}
        onClick={handleContainerClick}
      >
        {rendering ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span>正在載入與排版樂譜…</span>
          </div>
        ) : renderError ? (
          <div className="max-w-xl mx-auto my-8 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm space-y-1">
            <div className="font-semibold">樂譜排版發生錯誤</div>
            <div className="text-xs leading-relaxed break-words">
              {renderError}
            </div>
          </div>
        ) : renderedPages.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            目前尚無可顯示的樂譜頁面
          </div>
        ) : (
          <div
            className="dolce-scope score-pages-container"
            style={{ "--score-zoom": zoom } as React.CSSProperties}
          >
            {renderedPages.map((entry, idx) => (
              <div
                key={`${activeView}-${semitones}-${idx}`}
                ref={(el) => {
                  pageContainerRefs.current[idx] = el;
                }}
                className="score-page-wrap"
                style={{
                  aspectRatio: `${entry.size.w} / ${entry.size.h}`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DolceScoreViewport;
