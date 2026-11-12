import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  FileMusic,
  FilePlus2,
  Trash2,
} from "lucide-react";
import type { SongScore } from "@/content.config";
import type { RecogView } from "@/lib/dolce/omr";
import { IMAGE_ACCEPT, isDocFile, isImageFile, isProjectFile } from "@/lib/dolce/common/filetypes";
import { App, type AppDomRefs, type ViewMode } from "@/lib/dolce/editor/app";
import { setupCompareSelect } from "@/lib/dolce/editor/comparemode";
import { showHanConvDialog, showOptionsDialog } from "@/lib/dolce/editor/dialogs";
import { showExportDialog, showSaveAsDialog } from "@/lib/dolce/editor/export";
import type { DocFormatId } from "@/lib/dolce/editor/formats";
import { showHelpDialog } from "@/lib/dolce/editor/help";
import { closePartsPanel, showPartsPanel } from "@/lib/dolce/editor/parts";
import { attachPinchZoom } from "@/lib/dolce/editor/pinchzoom";
import { SAMPLE } from "@/lib/dolce/editor/sample";
import { setupSplitters } from "@/lib/dolce/editor/splitters";
import { setupPopover } from "@/lib/dolce/editor/toolpop";
import { closeInlineEditor } from "@/lib/dolce/editor/visual/inline";
import { closeMenu } from "@/lib/dolce/editor/visual/menu";
import { encodeJpwabc } from "@/lib/dolce/editor/fileio";
import { applyI18n, initLang, onLangChange, t } from "@/lib/dolce/i18n";
import { scoreDocToMusicXml } from "@/lib/dolce/model/toxml";
import {
  extractSongMetaAndLyricsFromScore,
  type ExtractedSongContent,
} from "@/lib/dolce-bridge/extractor";
import {
  ensureDolceReady,
  parseScoreDoc,
  scoreFormatLabel,
  type ScoreViewMode,
} from "@/lib/dolce-bridge/runtime";
import "../../styles/dolce.css";

export interface IncomingOmrBatch {
  id: number;
  files: File[];
}

export interface DolceOmrWorkspaceProps {
  score?: SongScore;
  originalKey?: string;
  onScoreChange: (score: SongScore | undefined) => void;
  onExtractToSong: (extracted: ExtractedSongContent) => void;
  incomingFiles?: IncomingOmrBatch | null;
}

const BARS_PER_LINE_KEY = "dolce-bars-per-line";

const STARTER_123_TEMPLATE = `%123
T: 新建敬拜詩歌
C: 詞曲：
K: C
P: 4/4
Q: 1/4=72

1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |]
w: 在 這 裡 我 敬 拜 你 單 單 仰 望 你
`;

function scoreKey(s: SongScore | undefined): string | null {
  if (!s) return null;
  return JSON.stringify([s.format, s.content, s.sourceKind ?? null, s.defaultView ?? null]);
}

function docFormatShortLabel(fmt: DocFormatId): string {
  switch (fmt) {
    case "123":
      return "123 簡譜";
    case "abc":
      return "ABC";
    case "musicxml":
      return "MusicXML";
    case "jpwabc":
      return "JPWABC";
    case "fanqie":
      return "文本譜";
    case "jly":
      return "jianpu-ly";
    case "jcx":
      return "Muse .jcx";
  }
}

function normalizeToSongScore(
  app: App,
): { score: SongScore; convertedFrom?: DocFormatId } | null {
  const defaultView: SongScore["defaultView"] = app.viewMode;
  const sourceKind: SongScore["sourceKind"] =
    app.omr.sessionKind === "jianpu"
      ? "jianpu"
      : app.viewMode === "mixed"
        ? "mixed"
        : app.omr.sessionKind === "staff" ||
            app.omr.sessionKind === "vector" ||
            app.docFormat === "musicxml" ||
            app.viewMode === "staff"
          ? "staff"
          : "jianpu";

  if (app.docFormat === "123" || app.docFormat === "abc" || app.docFormat === "musicxml") {
    const content = app.getText();
    if (!content.trim()) return null;
    try {
      const doc = app.scoreDoc();
      if (!doc || !doc.songs.length) return null;
    } catch {
      return null;
    }
    return {
      score: {
        format: app.docFormat,
        content,
        sourceKind,
        defaultView,
      },
    };
  }

  try {
    const converted = app.convertTo("123");
    if (converted && converted.trim()) {
      return {
        score: {
          format: "123",
          content: converted,
          sourceKind,
          defaultView,
        },
        convertedFrom: app.docFormat,
      };
    }
  } catch {
    // Fall back to MusicXML serialization below
  }

  try {
    const doc = app.scoreDoc();
    if (doc && doc.songs.length > 0) {
      const xml = scoreDocToMusicXml(doc);
      if (xml.trim()) {
        return {
          score: {
            format: "musicxml",
            content: xml,
            sourceKind,
            defaultView,
          },
          convertedFrom: app.docFormat,
        };
      }
    }
  } catch {
    // Unparseable mid-edit; caller retains last valid song score
  }

  return null;
}

export const DolceOmrWorkspace: React.FC<DolceOmrWorkspaceProps> = ({
  score,
  originalKey,
  onScoreChange,
  onExtractToSong,
  incomingFiles,
}) => {
  const [ready, setReady] = useState(false);
  const [onStartScreen, setOnStartScreen] = useState(true);
  const [activeDocFormat, setActiveDocFormat] = useState<DocFormatId | null>(
    score ? score.format : null,
  );
  const [syncPendingWarning, setSyncPendingWarning] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostNotice, setHostNotice] = useState<string | null>(null);

  // Refs for callbacks / props to keep the imperative workbench lifecycle effect strictly mount-once
  const onScoreChangeRef = useRef(onScoreChange);
  onScoreChangeRef.current = onScoreChange;
  const scoreRef = useRef(score);
  scoreRef.current = score;

  const appRef = useRef<App | null>(null);
  const isStartingRef = useRef(true);
  const suppressSyncRef = useRef(false);
  const lastEmittedKeyRef = useRef<string | null>(scoreKey(score));
  const lastBatchIdRef = useRef<number>(-1);
  const pendingIncomingRef = useRef<File[] | null>(null);
  const processIncomingRef = useRef<(files: File[]) => Promise<void>>(async () => {});
  const revealWorkspaceRef = useRef<() => void>(() => {});
  const showStartScreenRef = useRef<() => void>(() => {});
  const emitFromAppRef = useRef<(app: App) => void>(() => {});

  // DOM refs inside .dolce-scope
  const scopeRootRef = useRef<HTMLDivElement | null>(null);
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const btnHomeRef = useRef<HTMLButtonElement | null>(null);
  const btnHeaderMoreRef = useRef<HTMLButtonElement | null>(null);
  const headerToolsRef = useRef<HTMLDivElement | null>(null);
  const btnPartsRef = useRef<HTMLButtonElement | null>(null);
  const btnHanziRef = useRef<HTMLButtonElement | null>(null);
  const btnOptionsRef = useRef<HTMLButtonElement | null>(null);
  const btnHelpRef = useRef<HTMLButtonElement | null>(null);
  const btnSaveRef = useRef<HTMLButtonElement | null>(null);
  const btnSaveAsRef = useRef<HTMLButtonElement | null>(null);
  const btnExportRef = useRef<HTMLButtonElement | null>(null);

  const btnLayoutOriginalRef = useRef<HTMLButtonElement | null>(null);
  const btnPhraseRef = useRef<HTMLButtonElement | null>(null);
  const btnBarsRef = useRef<HTMLButtonElement | null>(null);
  const selBarsPerLineRef = useRef<HTMLSelectElement | null>(null);
  const btnSrcPagesRef = useRef<HTMLButtonElement | null>(null);
  const selRecogKindRef = useRef<HTMLSelectElement | null>(null);

  const btnPlayRef = useRef<HTMLButtonElement | null>(null);
  const btnStopRef = useRef<HTMLButtonElement | null>(null);
  const playProgressRef = useRef<HTMLInputElement | null>(null);
  const playTimeRef = useRef<HTMLButtonElement | null>(null);
  const selSpeedRef = useRef<HTMLSelectElement | null>(null);
  const btnLoopRef = useRef<HTMLButtonElement | null>(null);
  const btnMetronomeRef = useRef<HTMLButtonElement | null>(null);
  const btnMobileCodeRef = useRef<HTMLButtonElement | null>(null);
  const btnMobileScoreRef = useRef<HTMLButtonElement | null>(null);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const codePaneMetaRef = useRef<HTMLSpanElement | null>(null);
  const docFormatFieldRef = useRef<HTMLLabelElement | null>(null);
  const selDocFormatRef = useRef<HTMLSelectElement | null>(null);
  const docFormatNoteRef = useRef<HTMLSpanElement | null>(null);
  const codePaneRef = useRef<HTMLDivElement | null>(null);
  const splitCodeRef = useRef<HTMLDivElement | null>(null);

  const scoreShellRef = useRef<HTMLElement | null>(null);
  const visualModeRef = useRef<HTMLSpanElement | null>(null);
  const btnPaletteRef = useRef<HTMLButtonElement | null>(null);
  const btnBeatCheckRef = useRef<HTMLButtonElement | null>(null);
  const btnFormatMarksRef = useRef<HTMLButtonElement | null>(null);
  const viewModeSwitchRef = useRef<HTMLDivElement | null>(null);
  const btnViewExpandedRef = useRef<HTMLButtonElement | null>(null);
  const btnViewOriginalRef = useRef<HTMLButtonElement | null>(null);
  const btnViewStaffRef = useRef<HTMLButtonElement | null>(null);
  const btnViewMixedRef = useRef<HTMLButtonElement | null>(null);
  const visualPaletteRef = useRef<HTMLDivElement | null>(null);
  const selInfoRef = useRef<HTMLSpanElement | null>(null);
  const beatCountRef = useRef<HTMLSpanElement | null>(null);
  const scorePaneRef = useRef<HTMLDivElement | null>(null);
  const omrFollowRef = useRef<HTMLDivElement | null>(null);
  const omrSideRef = useRef<HTMLDivElement | null>(null);
  const splitSideRef = useRef<HTMLDivElement | null>(null);

  const startScreenRef = useRef<HTMLElement | null>(null);
  const btnStartImageRef = useRef<HTMLButtonElement | null>(null);
  const btnStartScoreRef = useRef<HTMLButtonElement | null>(null);
  const selRecogKindStartRef = useRef<HTMLSelectElement | null>(null);
  const chkAdjustFirstRef = useRef<HTMLInputElement | null>(null);
  const btnStartSampleRef = useRef<HTMLButtonElement | null>(null);
  const startFeedbackRef = useRef<HTMLDivElement | null>(null);
  const recognitionProgressRef = useRef<HTMLDivElement | null>(null);
  const recognitionProgressDetailRef = useRef<HTMLSpanElement | null>(null);

  const statusRef = useRef<HTMLDivElement | null>(null);
  const btnDoubtRef = useRef<HTMLButtonElement | null>(null);
  const chkCodeRef = useRef<HTMLInputElement | null>(null);
  const compareFieldRef = useRef<HTMLLabelElement | null>(null);
  const selCompareRef = useRef<HTMLSelectElement | null>(null);
  const btnRecognizeRef = useRef<HTMLButtonElement | null>(null);
  const btnSrcSideRef = useRef<HTMLButtonElement | null>(null);
  const btnSrcFollowRef = useRef<HTMLButtonElement | null>(null);
  const selRecogViewRef = useRef<HTMLSelectElement | null>(null);
  const btnZoomOutRef = useRef<HTMLButtonElement | null>(null);
  const btnZoomResetRef = useRef<HTMLButtonElement | null>(null);
  const btnZoomInRef = useRef<HTMLButtonElement | null>(null);
  const btnPrevRef = useRef<HTMLButtonElement | null>(null);
  const btnNextRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    const signal = abort.signal;
    const cleanups: Array<() => void> = [];

    const scopeEl = scopeRootRef.current;
    const workbenchEl = workbenchRef.current;
    const bodyEl = bodyRef.current;
    const codePaneEl = codePaneRef.current;
    const scorePaneEl = scorePaneRef.current;
    const scoreShellEl = scoreShellRef.current;
    const splitCodeEl = splitCodeRef.current;
    const splitSideEl = splitSideRef.current;
    const startScreenEl = startScreenRef.current;
    const startFeedbackEl = startFeedbackRef.current;
    const recognitionProgressEl = recognitionProgressRef.current;
    const recognitionDetailEl = recognitionProgressDetailRef.current;

    if (
      !scopeEl ||
      !workbenchEl ||
      !bodyEl ||
      !codePaneEl ||
      !scorePaneEl ||
      !scoreShellEl ||
      !splitCodeEl ||
      !splitSideEl ||
      !startScreenEl ||
      !startFeedbackEl ||
      !recognitionProgressEl
    ) {
      return;
    }

    const revealWorkspace = () => {
      startScreenEl.hidden = true;
      workbenchEl.classList.remove("is-starting");
      isStartingRef.current = false;
      setOnStartScreen(false);
    };

    const showStartScreen = () => {
      startScreenEl.hidden = false;
      workbenchEl.classList.add("is-starting");
      isStartingRef.current = true;
      setOnStartScreen(true);
    };

    revealWorkspaceRef.current = revealWorkspace;
    showStartScreenRef.current = showStartScreen;

    const emitScoreFromApp = (app: App) => {
      if (suppressSyncRef.current || isStartingRef.current) return;
      if (codePaneEl.classList.contains("omr-pending")) return;
      setActiveDocFormat(app.docFormat);
      const normalized = normalizeToSongScore(app);
      if (!normalized) {
        setSyncPendingWarning(true);
        return;
      }
      setSyncPendingWarning(false);
      const nextKey = scoreKey(normalized.score);
      if (nextKey !== lastEmittedKeyRef.current) {
        lastEmittedKeyRef.current = nextKey;
        onScoreChangeRef.current(normalized.score);
      }
    };
    emitFromAppRef.current = emitScoreFromApp;

    const hydrateSongScore = async (app: App, s: SongScore): Promise<void> => {
      suppressSyncRef.current = true;
      try {
        revealWorkspace();
        app.stopPlayback();
        app.omr.clear();
        app.formats.use(null);
        app.adoptText(s.format, s.content, null);
        if (s.defaultView && app.viewMode !== s.defaultView) {
          await app.setViewMode(s.defaultView);
        }
        app.markClean();
        setActiveDocFormat(app.docFormat);
        setSyncPendingWarning(false);
        lastEmittedKeyRef.current = scoreKey(s);
      } finally {
        suppressSyncRef.current = false;
      }
    };

    async function boot(): Promise<void> {
      initLang();
      applyI18n(scopeEl!);
      const meta = await ensureDolceReady();
      if (disposed) return;

      codePaneEl!.replaceChildren();
      scorePaneEl!.replaceChildren();

      const domRefs: AppDomRefs = {
        body: bodyEl,
        status: statusRef.current,
        codePane: codePaneEl,
        codePaneMeta: codePaneMetaRef.current,
        docFormatField: docFormatFieldRef.current,
        splitSide: splitSideEl,
        recognitionProgressDetail: recognitionDetailEl,
        onOpenParts: () => {
          if (appRef.current) showPartsPanel(appRef.current);
        },
        onDocChange: (changedApp) => {
          emitScoreFromApp(changedApp);
        },
      };

      const app = new App(meta, scorePaneEl!, domRefs);
      appRef.current = app;
      app.loadSettings();

      app.visual.attach({
        mode: visualModeRef.current,
        selInfo: selInfoRef.current,
        marksBtn: btnFormatMarksRef.current,
        beatBtn: btnBeatCheckRef.current,
        beatCount: beatCountRef.current,
        palette: visualPaletteRef.current,
        paletteBtn: btnPaletteRef.current,
      });

      app.mountEditor(codePaneEl!, SAMPLE);

      const mobileCodeBtn = btnMobileCodeRef.current;
      const mobileScoreBtn = btnMobileScoreRef.current;
      const setMobileView = (view: "code" | "score") => {
        const showCode = view === "code";
        bodyEl!.classList.toggle("mobile-code", showCode);
        mobileCodeBtn?.classList.toggle("active", showCode);
        mobileScoreBtn?.classList.toggle("active", !showCode);
        mobileCodeBtn?.setAttribute("aria-pressed", String(showCode));
        mobileScoreBtn?.setAttribute("aria-pressed", String(!showCode));
      };

      const setRecognitionBusy = (busy: boolean) => {
        recognitionProgressEl!.hidden = !busy;
        if (busy && recognitionDetailEl) {
          recognitionDetailEl.textContent = t("start.progress.sub");
        }
      };

      const setStartFeedback = (message: string) => {
        startFeedbackEl!.textContent = message;
        startFeedbackEl!.hidden = !message;
        if (message && app.omr.hasInputs) {
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "start-feedback-retry";
          retry.textContent = t("start.retryAdjust");
          retry.addEventListener(
            "click",
            () =>
              void app.omr.showPages((ok) => {
                if (ok) {
                  setStartFeedback("");
                  setMobileView("score");
                  revealWorkspace();
                  emitScoreFromApp(app);
                } else {
                  setStartFeedback(app.status || t("start.recogFailed"));
                }
              }),
            { signal },
          );
          startFeedbackEl!.append(" ", retry);
        }
      };

      let fromStart = false;
      app.omr.onEarlyView = () => {
        setRecognitionBusy(false);
        setMobileView("score");
        revealWorkspace();
      };
      const recognitionStart = () => {
        fromStart = workbenchEl!.classList.contains("is-starting");
        setStartFeedback("");
        setRecognitionBusy(true);
      };
      const recognitionDone = (success: boolean) => {
        setRecognitionBusy(false);
        if (success) {
          setMobileView("score");
          revealWorkspace();
          emitScoreFromApp(app);
          setHostError(null);
          setHostNotice("樂譜辨識完成，可直接點擊譜面校對或進行試聽與編輯。");
        } else if (fromStart) {
          showStartScreen();
          setStartFeedback(app.status || t("start.recognizeFailed"));
        }
      };

      // Header & action buttons
      btnSaveRef.current?.addEventListener("click", () => void app.saveFile(), { signal });
      btnSaveAsRef.current?.addEventListener("click", () => showSaveAsDialog(app), { signal });
      btnPrevRef.current?.addEventListener("click", () => app.prevPage(), { signal });
      btnNextRef.current?.addEventListener("click", () => app.nextPage(), { signal });
      btnOptionsRef.current?.addEventListener("click", () => showOptionsDialog(app), { signal });
      btnPartsRef.current?.addEventListener("click", () => showPartsPanel(app), { signal });
      if (btnHanziRef.current) {
        app.setHanziButton(btnHanziRef.current);
        btnHanziRef.current.addEventListener("click", () => showHanConvDialog(app), { signal });
      }
      btnExportRef.current?.addEventListener("click", () => showExportDialog(app), { signal });
      btnHelpRef.current?.addEventListener("click", () => showHelpDialog(app), { signal });

      if (btnHeaderMoreRef.current && headerToolsRef.current) {
        cleanups.push(setupPopover(btnHeaderMoreRef.current, headerToolsRef.current));
      }

      // View mode buttons
      const viewBtns = new Map<ViewMode, HTMLButtonElement>();
      const viewPairs = [
        ["expanded", btnViewExpandedRef.current],
        ["original", btnViewOriginalRef.current],
        ["staff", btnViewStaffRef.current],
        ["mixed", btnViewMixedRef.current],
      ] as const;
      for (const [mode, btn] of viewPairs) {
        if (btn) {
          viewBtns.set(mode, btn);
          btn.addEventListener("click", () => void app.setViewMode(mode), { signal });
        }
      }
      if (viewModeSwitchRef.current) {
        app.setViewModeButtons(viewModeSwitchRef.current, viewBtns);
      }

      // OMR controls
      if (btnRecognizeRef.current) {
        app.omr.setRecognizeBtn(btnRecognizeRef.current);
        btnRecognizeRef.current.addEventListener("click", () => void app.omr.toggle(), {
          signal,
        });
      }
      app.omr.setKindSelects(selRecogKindStartRef.current, selRecogKindRef.current);
      if (chkAdjustFirstRef.current) {
        chkAdjustFirstRef.current.checked = app.omr.adjustFirst;
        chkAdjustFirstRef.current.addEventListener(
          "change",
          () => {
            app.omr.adjustFirst = chkAdjustFirstRef.current!.checked;
            app.saveSettings();
          },
          { signal },
        );
      }
      if (btnDoubtRef.current) app.omr.setDoubtEl(btnDoubtRef.current);
      if (btnSrcPagesRef.current) app.omr.setPagesBtn(btnSrcPagesRef.current);
      if (chkCodeRef.current) app.omr.setCodeCheckbox(chkCodeRef.current);
      if (btnSrcSideRef.current) app.omr.setSideBtn(btnSrcSideRef.current, omrSideRef.current);
      if (btnSrcFollowRef.current) {
        app.omr.setFollowBtn(btnSrcFollowRef.current, omrFollowRef.current);
      }
      if (selRecogViewRef.current) {
        app.omr.setRecogViewSelect(selRecogViewRef.current);
        selRecogViewRef.current.addEventListener(
          "change",
          () => app.omr.setRecogView(selRecogViewRef.current!.value as RecogView),
          { signal },
        );
      }

      if (
        selCompareRef.current &&
        compareFieldRef.current &&
        btnRecognizeRef.current &&
        btnSrcSideRef.current &&
        btnSrcFollowRef.current &&
        selRecogViewRef.current
      ) {
        const compare = setupCompareSelect({
          body: bodyEl,
          select: selCompareRef.current,
          field: compareFieldRef.current,
          recognize: btnRecognizeRef.current,
          side: btnSrcSideRef.current,
          follow: btnSrcFollowRef.current,
          view: selRecogViewRef.current,
          onUserChange: (v) => app.omr.setComparePreference(v),
        });
        app.omr.applyCompare = (v) => compare.apply(v);
        cleanups.push(() => compare.dispose());
      }

      if (selDocFormatRef.current) app.formats.bind(selDocFormatRef.current);
      if (docFormatNoteRef.current) app.formats.bindNote(docFormatNoteRef.current);

      // Phrase / bars layout controls
      const originalLayoutBtn = btnLayoutOriginalRef.current;
      const phraseBtn = btnPhraseRef.current;
      const barsBtn = btnBarsRef.current;
      const barsSel = selBarsPerLineRef.current;
      if (originalLayoutBtn && phraseBtn && barsBtn && barsSel) {
        try {
          const last = localStorage.getItem(BARS_PER_LINE_KEY);
          if (last && [...barsSel.options].some((o) => o.value === last)) barsSel.value = last;
        } catch {
          /* ignore */
        }
        app.setPhraseButtons(originalLayoutBtn, phraseBtn, barsBtn, barsSel);
        originalLayoutBtn.addEventListener("click", () => app.setLineMode("original"), {
          signal,
        });
        phraseBtn.addEventListener("click", () => app.setLineMode("phrase"), { signal });
        barsBtn.addEventListener("click", () => app.setLineMode("bars"), { signal });
        barsSel.addEventListener(
          "change",
          () => {
            try {
              localStorage.setItem(BARS_PER_LINE_KEY, barsSel.value);
            } catch {
              /* ignore */
            }
            app.setLineMode("bars", Number(barsSel.value));
          },
          { signal },
        );
      }

      // Playback controls
      if (btnPlayRef.current) {
        app.playback.setPlaybackBtn(btnPlayRef.current);
        btnPlayRef.current.addEventListener("click", () => void app.playback.toggle(), {
          signal,
        });
      }
      if (btnStopRef.current) app.playback.setStopBtn(btnStopRef.current);
      if (playProgressRef.current) {
        app.playback.bindProgress(playProgressRef.current, playTimeRef.current);
      }
      if (selSpeedRef.current) app.playback.bindSpeedSelect(selSpeedRef.current);
      app.playback.bindToggles(btnLoopRef.current, btnMetronomeRef.current);

      // File picking & start actions
      const openScore = async () => {
        if (await app.openFile()) {
          revealWorkspace();
          emitScoreFromApp(app);
          setHostError(null);
        }
      };

      const pickRecognitionFile = async () => {
        if (app.isDirty() && !(await app.confirmReplace())) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = IMAGE_ACCEPT;
        input.multiple = true;
        input.onchange = async () => {
          const picked = [...(input.files ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name, "zh"),
          );
          if (!picked.length) return;
          const raw = [];
          for (const f of picked) {
            raw.push({
              bytes: new Uint8Array(await f.arrayBuffer()),
              mime: f.type,
              name: f.name,
            });
          }
          const files = await app.omr.prepareInputs(raw);
          if (!files) return;
          recognitionStart();
          let ok = false;
          try {
            ok = await app.omr.recognizeFiles(files);
          } finally {
            recognitionDone(ok);
          }
        };
        input.click();
      };

      const showSample = async () => {
        if (!(await app.confirmReplace())) return;
        app.importBytes(encodeJpwabc(SAMPLE), "sample.jpwabc");
        app.filePath = null;
        app.markClean();
        revealWorkspace();
        emitScoreFromApp(app);
        setHostError(null);
        setHostNotice("已載入範例樂譜（JPWABC → 同步儲存為 123 簡譜）。");
      };

      btnStartScoreRef.current?.addEventListener("click", () => void openScore(), { signal });
      btnStartImageRef.current?.addEventListener(
        "click",
        () => void pickRecognitionFile(),
        { signal },
      );
      btnStartSampleRef.current?.addEventListener("click", () => void showSample(), { signal });
      btnHomeRef.current?.addEventListener("click", showStartScreen, { signal });
      mobileCodeBtn?.addEventListener("click", () => setMobileView("code"), { signal });
      mobileScoreBtn?.addEventListener("click", () => setMobileView("score"), { signal });

      // Zoom & Splitters
      const updateZoom = () => {
        if (btnZoomResetRef.current) {
          btnZoomResetRef.current.textContent = `${Math.round(app.zoom * 100)}%`;
        }
      };
      btnZoomInRef.current?.addEventListener(
        "click",
        () => {
          app.zoomBy(1.2);
          updateZoom();
        },
        { signal },
      );
      btnZoomOutRef.current?.addEventListener(
        "click",
        () => {
          app.zoomBy(1 / 1.2);
          updateZoom();
        },
        { signal },
      );
      btnZoomResetRef.current?.addEventListener(
        "click",
        () => {
          app.resetZoom();
          updateZoom();
        },
        { signal },
      );
      updateZoom();

      cleanups.push(
        attachPinchZoom(scorePaneEl!, {
          get: () => app.zoom,
          set: (z) => app.setZoom(z),
          pages: () => scorePaneEl!.querySelectorAll(".score-page-wrap"),
          onChange: updateZoom,
        }),
      );

      cleanups.push(
        setupSplitters({
          body: bodyEl!,
          scoreShell: scoreShellEl!,
          splitCode: splitCodeEl!,
          splitSide: splitSideEl!,
        }),
      );

      cleanups.push(
        onLangChange(() => {
          document
            .querySelectorAll(".dolce-scope.modal-overlay, .dolce-scope.omr-crop-overlay")
            .forEach((el) => el.remove());
          applyI18n(scopeEl!);
          app.relabel();
          if (!startFeedbackEl!.hidden) setStartFeedback("");
        }),
      );

      // Scoped zoom & paging hotkeys (avoid capturing unrelated SongBuilder inputs)
      window.addEventListener(
        "keydown",
        (e) => {
          const target = e.target as Node | null;
          const active = document.activeElement;
          const inWorkbench =
            !isStartingRef.current &&
            (workbenchEl!.contains(target) || workbenchEl!.contains(active));
          if (!inWorkbench) return;
          const mod = e.ctrlKey || e.metaKey;
          if (mod && (e.key === "=" || e.key === "+")) {
            e.preventDefault();
            app.zoomBy(1.2);
            updateZoom();
          } else if (mod && e.key === "-") {
            e.preventDefault();
            app.zoomBy(1 / 1.2);
            updateZoom();
          } else if (mod && e.key === "0") {
            e.preventDefault();
            app.resetZoom();
            updateZoom();
          } else if (e.key === "PageDown") {
            app.nextPage();
          } else if (e.key === "PageUp") {
            app.prevPage();
          } else if (e.key === "Home" && e.ctrlKey) {
            app.goToPage(0);
          } else if (e.key === "End" && e.ctrlKey) {
            app.goToPage(1e9);
          }
        },
        { signal },
      );

      // Process incoming batch of image / PDF / score files (drag-drop inside workbench or from SongBuilder)
      const handleFileBatch = async (files: File[]): Promise<void> => {
        if (!files.length) return;
        const first = files[0]!;
        const isImg = (f: File) =>
          isImageFile(f.name) || f.type.startsWith("image/") || f.type === "application/pdf";
        const singleDoc =
          files.length === 1 && !isImg(first) && (isDocFile(first.name) || isProjectFile(first.name));
        const imgFiles = files.filter(isImg).sort((a, b) => a.name.localeCompare(b.name, "zh"));
        if (!singleDoc && !imgFiles.length) return;

        // Read bytes eagerly before confirmation dialogs (browsers can invalidate FileList items after await)
        const docBuf = singleDoc ? new Uint8Array(await first.arrayBuffer()) : null;
        const rawImgs = singleDoc
          ? null
          : await Promise.all(
              imgFiles.map(async (f) => ({
                bytes: new Uint8Array(await f.arrayBuffer()),
                mime: f.type,
                name: f.name,
              })),
            );

        if (app.isDirty() && !(await app.confirmReplace())) return;

        if (singleDoc && docBuf) {
          if (isProjectFile(first.name)) {
            const ok = await app.openProject(docBuf, first.name);
            if (ok) {
              revealWorkspace();
              emitScoreFromApp(app);
              setHostError(null);
              setHostNotice(`已還原識別專案「${first.name}」。`);
            }
            return;
          }
          app.importBytes(docBuf, first.name);
          app.filePath = first.name;
          revealWorkspace();
          await app.onDocumentOpened();
          emitScoreFromApp(app);
          setHostError(null);
          setHostNotice(`已匯入樂譜檔案「${first.name}」。`);
          return;
        }

        if (rawImgs && rawImgs.length) {
          const prepared = await app.omr.prepareInputs(rawImgs);
          if (!prepared) return;
          recognitionStart();
          let ok = false;
          try {
            ok = await app.omr.recognizeFiles(prepared);
          } finally {
            recognitionDone(ok);
          }
        }
      };

      processIncomingRef.current = handleFileBatch;

      // Drag & drop directly onto the Dolce workbench
      bodyEl!.addEventListener(
        "dragover",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          bodyEl!.classList.add("drag-active");
        },
        { signal },
      );
      bodyEl!.addEventListener(
        "dragleave",
        (e) => {
          if (!bodyEl!.contains(e.relatedTarget as Node | null)) {
            bodyEl!.classList.remove("drag-active");
          }
        },
        { signal },
      );
      bodyEl!.addEventListener(
        "drop",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          bodyEl!.classList.remove("drag-active");
          const files = [...(e.dataTransfer?.files ?? [])];
          if (files.length > 0) void handleFileBatch(files);
        },
        { signal },
      );

      if (typeof navigator !== "undefined" && !navigator.webdriver) {
        window.addEventListener(
          "beforeunload",
          (ev) => {
            if (app.isDirty()) ev.preventDefault();
          },
          { signal },
        );
      }

      // Hydrate initial score prop if SongBuilder already loaded a song
      if (scoreRef.current) {
        await hydrateSongScore(app, scoreRef.current);
      }

      if (!disposed) {
        setReady(true);
        const queued = pendingIncomingRef.current;
        if (queued?.length) {
          pendingIncomingRef.current = null;
          void handleFileBatch(queued);
        }
      }
    }

    void boot().catch((err) => {
      if (!disposed) {
        setHostError(
          `無法啟動 Dolce 樂譜工作台：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    return () => {
      disposed = true;
      abort.abort();
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      closePartsPanel();
      closeMenu();
      closeInlineEditor();
      appRef.current?.dispose();
      appRef.current = null;
      document
        .querySelectorAll(
          ".dolce-scope.modal-overlay, .dolce-scope.omr-crop-overlay, .dolce-scope.visual-menu, .dolce-scope.vis-inline, .dolce-scope.vis-marquee, .dolce-scope.omr-row-menu",
        )
        .forEach((el) => el.remove());
    };
  }, []);

  // Sync external score changes (e.g. loading a song JSON or resetting SongBuilder) into Dolce App
  useEffect(() => {
    const app = appRef.current;
    if (!ready || !app) return;

    const incomingKey = scoreKey(score);
    if (incomingKey === lastEmittedKeyRef.current) return;

    if (!score) {
      suppressSyncRef.current = true;
      try {
        app.stopPlayback();
        app.omr.clear();
        app.formats.use(null);
        app.adoptText("jpwabc", SAMPLE, null);
        app.markClean();
        showStartScreenRef.current();
        setActiveDocFormat(null);
        setSyncPendingWarning(false);
        lastEmittedKeyRef.current = null;
      } finally {
        suppressSyncRef.current = false;
      }
      return;
    }

    void (async () => {
      suppressSyncRef.current = true;
      try {
        revealWorkspaceRef.current();
        app.stopPlayback();
        app.omr.clear();
        app.formats.use(null);
        app.adoptText(score.format, score.content, null);
        if (score.defaultView && app.viewMode !== score.defaultView) {
          await app.setViewMode(score.defaultView);
        }
        app.markClean();
        setActiveDocFormat(app.docFormat);
        setSyncPendingWarning(false);
        lastEmittedKeyRef.current = incomingKey;
      } finally {
        suppressSyncRef.current = false;
      }
    })();
  }, [ready, score]);

  // Receive sheet / PDF / score files dropped onto the parent SongBuilder window
  useEffect(() => {
    if (!incomingFiles || incomingFiles.id === lastBatchIdRef.current) return;
    lastBatchIdRef.current = incomingFiles.id;
    if (!ready || !appRef.current) {
      pendingIncomingRef.current = incomingFiles.files;
      return;
    }
    void processIncomingRef.current(incomingFiles.files);
  }, [ready, incomingFiles]);

  const handleCreateStarterScore = () => {
    const app = appRef.current;
    setHostError(null);
    if (!app) {
      const nextScore: SongScore = {
        format: "123",
        content: STARTER_123_TEMPLATE,
        sourceKind: "jianpu",
        defaultView: "original",
      };
      onScoreChange(nextScore);
      return;
    }
    void (async () => {
      if (app.isDirty() && !(await app.confirmReplace())) return;
      suppressSyncRef.current = true;
      try {
        app.stopPlayback();
        app.omr.clear();
        app.formats.use(null);
        app.adoptText("123", STARTER_123_TEMPLATE, null);
        if (app.viewMode !== "original") await app.setViewMode("original");
        app.markClean();
        revealWorkspaceRef.current();
      } finally {
        suppressSyncRef.current = false;
      }
      emitFromAppRef.current(app);
      setHostNotice("已建立空白 123 簡譜範本，可直接於下方原始碼或譜面上編輯。");
    })();
  };

  const handleDetachScore = () => {
    const app = appRef.current;
    setHostError(null);
    setSyncPendingWarning(false);
    if (app) {
      suppressSyncRef.current = true;
      try {
        app.stopPlayback();
        app.omr.clear();
        app.formats.use(null);
        app.adoptText("jpwabc", SAMPLE, null);
        app.markClean();
        showStartScreenRef.current();
      } finally {
        suppressSyncRef.current = false;
      }
    }
    lastEmittedKeyRef.current = null;
    setActiveDocFormat(null);
    onScoreChange(undefined);
    setHostNotice("已從目前歌曲移除內嵌樂譜。");
  };

  const handleDefaultViewChange = (nextView: ScoreViewMode) => {
    if (!score) return;
    const nextScore: SongScore = { ...score, defaultView: nextView };
    const app = appRef.current;
    if (app && ready) {
      suppressSyncRef.current = true;
      void app
        .setViewMode(nextView)
        .finally(() => {
          suppressSyncRef.current = false;
        });
    }
    lastEmittedKeyRef.current = scoreKey(nextScore);
    onScoreChange(nextScore);
  };

  const handleExtractClick = () => {
    setHostError(null);
    setHostNotice(null);
    const app = appRef.current;
    let doc = null;
    if (app && ready && !isStartingRef.current) {
      doc = (app.docFormat === "jpwabc" ? app.jpwDoc : null) ?? app.scoreDoc();
    }
    if (!doc && score?.content.trim()) {
      try {
        doc = parseScoreDoc(score.format, score.content);
      } catch (err) {
        setHostError(
          `解析樂譜失敗，無法提取歌詞或中繼資料：${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
    }
    if (!doc || !doc.songs.length) {
      setHostError("目前樂譜內容尚未包含有效的樂曲資料，無法提取。");
      return;
    }

    const extracted = extractSongMetaAndLyricsFromScore(doc);
    onExtractToSong(extracted);
    const details: string[] = [];
    if (extracted.titleA) details.push(`歌名「${extracted.titleA}」`);
    if (extracted.originalKey) details.push(`原調 ${extracted.originalKey}`);
    if (extracted.bpm) details.push(`${extracted.bpm} BPM`);
    details.push(`${extracted.sections.length} 個歌詞段落`);
    setHostNotice(`已提取${details.join("、")}至左側歌曲表單！`);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Host integration action strip (SongBuilder metadata & attachment controls) */}
      <div className="px-5 py-4 border-b border-slate-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0 mt-0.5">
              <FileMusic className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  樂譜識別與簡譜／五線譜編輯工作台（Dolce）
                </h2>
                {score && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {activeDocFormat &&
                    activeDocFormat !== "123" &&
                    activeDocFormat !== "abc" &&
                    activeDocFormat !== "musicxml"
                      ? `編輯 ${docFormatShortLabel(activeDocFormat)} → 同步儲存為 ${scoreFormatLabel(score.format)}`
                      : `已內嵌：${scoreFormatLabel(score.format)}`}
                  </span>
                )}
                {syncPendingWarning && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    語法未完整，暫保留上次有效版本
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                支援圖片／PDF 離線辨識、譜面可視化編修、原始碼對照核對、按樂句重排、聲部混音、簡繁轉換與匯出{" "}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">.dolce</code> ／{" "}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">PPTX</code> ／{" "}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">MIDI</code> ／{" "}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">MusicXML</code> ／{" "}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">PDF</code>
                {originalKey ? `（目前表單原調：${originalKey}）` : ""}。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onStartScreen && score && (
              <button
                type="button"
                onClick={() => revealWorkspaceRef.current()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
              >
                <span>返回目前樂譜編輯區</span>
              </button>
            )}

            {!score && (
              <button
                type="button"
                onClick={handleCreateStarterScore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>手動建立空白簡譜</span>
              </button>
            )}

            {score && (
              <>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                  <span className="font-medium">歌曲頁面預設檢視</span>
                  <select
                    value={score.defaultView ?? "original"}
                    onChange={(e) =>
                      handleDefaultViewChange(e.target.value as ScoreViewMode)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="original">簡譜</option>
                    <option value="staff">五線譜</option>
                    <option value="mixed">混排</option>
                    <option value="expanded">投影</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={handleExtractClick}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <ArrowRightCircle className="w-3.5 h-3.5" />
                  <span>從樂譜提取資訊與歌詞到表單</span>
                </button>

                <button
                  type="button"
                  onClick={handleDetachScore}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>移除樂譜</span>
                </button>
              </>
            )}
          </div>
        </div>

        {hostError && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed break-words">{hostError}</span>
          </div>
        )}
        {hostNotice && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed break-words">{hostNotice}</span>
          </div>
        )}
      </div>

      {/* Embedded Full Dolce Workbench */}
      <div className="p-2 sm:p-3 bg-slate-100/70">
        <div ref={scopeRootRef} className="dolce-scope">
          <div ref={workbenchRef} className="dolce-workbench is-starting">
            <header className="dolce-header">
              <div className="header-left">
                <button
                  ref={btnHomeRef}
                  type="button"
                  className="button button-home dolce-btn-home"
                  aria-label="返回開始"
                  data-i18n-aria="header.home"
                >
                  <span className="button-symbol" aria-hidden="true">
                    ←
                  </span>
                  <span className="home-label" data-i18n="header.home">
                    返回開始
                  </span>
                </button>
                <div className="brand" aria-label="悅譜 Dolce" data-i18n-aria="header.brandAria">
                  <svg
                    className="brand-mark"
                    viewBox="0 0 32 32"
                    width="30"
                    height="30"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect width="32" height="32" rx="8" fill="#1ed760" />
                    <path
                      d="M19.5 7.5V20.2C19.5 22.85 17.26 24.8 14.5 24.8C11.9 24.8 10 23.15 10 21C10 18.85 11.9 17.2 14.5 17.2C15.52 17.2 16.45 17.46 17.2 17.9V11.2L23.5 9.6V12.8L19.5 13.8V7.5Z"
                      fill="#000000"
                    />
                  </svg>
                  <span className="brand-name">Dolce</span>
                  <span className="brand-subtitle" data-i18n="header.subtitle">
                    樂譜工作台
                  </span>
                </div>
              </div>
              <div className="header-actions">
                <button
                  ref={btnHeaderMoreRef}
                  type="button"
                  className="button button-tool header-more"
                  aria-expanded="false"
                  title="更多"
                  aria-label="更多"
                  data-i18n-title="header.more"
                  data-i18n-aria="header.more"
                >
                  ⋯
                </button>
                <div ref={headerToolsRef} className="header-tools">
                  <button
                    ref={btnPartsRef}
                    type="button"
                    className="button button-tool"
                    title="聲部：增刪、排序、改名、譜號、拆合閉合譜、歌詞複製；試聽靜音 / 獨奏 / 音量"
                    data-i18n-title="toolbar.parts.title"
                    data-i18n="toolbar.parts"
                  >
                    聲部
                  </button>
                  <button
                    ref={btnHanziRef}
                    type="button"
                    className="button button-tool"
                    title="整篇轉換原始碼中的中文（簡體 ⇄ 繁體）"
                    data-i18n-title="toolbar.hanzi.title"
                    data-i18n="toolbar.hanzi"
                  >
                    簡繁
                  </button>
                  <button
                    ref={btnOptionsRef}
                    type="button"
                    className="button button-tool"
                    data-i18n="toolbar.options"
                  >
                    設定
                  </button>
                  <button
                    ref={btnHelpRef}
                    type="button"
                    className="button button-tool"
                    title="功能說明、123 格式與記譜法說明"
                    data-i18n-title="toolbar.help.title"
                    data-i18n="toolbar.help"
                  >
                    說明
                  </button>
                </div>
                <span className="header-divider" aria-hidden="true" />
                <button
                  ref={btnSaveRef}
                  type="button"
                  className="button button-secondary"
                  data-i18n="header.save"
                >
                  儲存
                </button>
                <button
                  ref={btnSaveAsRef}
                  type="button"
                  className="button button-secondary"
                  data-i18n="header.saveAs"
                >
                  另存新檔
                </button>
                <button
                  ref={btnExportRef}
                  type="button"
                  className="button button-primary"
                  data-i18n="header.export"
                >
                  匯出
                </button>
              </div>
            </header>

            <div className="dolce-toolbar" aria-label="樂譜工具列" data-i18n-aria="toolbar.aria">
              <div className="tool-group context-tool-group" hidden>
                <span className="tool-label" data-i18n="toolbar.lines">
                  分行
                </span>
                <div
                  className="layout-mode-switch"
                  data-context-control
                  aria-label="分行方式"
                  data-i18n-aria="toolbar.linesAria"
                  hidden
                >
                  <button
                    ref={btnLayoutOriginalRef}
                    type="button"
                    className="active"
                    aria-pressed="true"
                    title="保留匯入或辨識時的行結構"
                    data-i18n-title="toolbar.layoutOriginal.title"
                    data-i18n="toolbar.layoutOriginal"
                  >
                    原始排版
                  </button>
                  <button
                    ref={btnPhraseRef}
                    type="button"
                    aria-pressed="false"
                    title="根據歌詞和音樂樂句重新安排換行"
                    data-i18n-title="toolbar.phrase.title"
                    data-i18n="toolbar.phrase"
                  >
                    按樂句重排
                  </button>
                  <span className="bars-per-line">
                    <button
                      ref={btnBarsRef}
                      type="button"
                      aria-pressed="false"
                      title="每行固定放幾個小節（弱起不計，原有換頁保留）"
                      data-i18n-title="toolbar.bars.title"
                      data-i18n="toolbar.bars"
                    >
                      每行
                    </button>
                    <select
                      ref={selBarsPerLineRef}
                      aria-label="每行小節數"
                      data-i18n-aria="toolbar.barsCount"
                      defaultValue="4"
                    >
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                      <option value="7">7</option>
                      <option value="8">8</option>
                    </select>
                    <span className="bars-unit" data-i18n="toolbar.barsUnit">
                      小節
                    </span>
                  </span>
                </div>
              </div>

              <div className="tool-group context-tool-group" hidden>
                <span className="tool-label" data-i18n="toolbar.recogGroup">
                  辨識
                </span>
                <button
                  ref={btnSrcPagesRef}
                  type="button"
                  data-context-control
                  title="這次辨識用的原圖：調順序、刪減、加圖、旋轉、裁剪，再按這些頁重新識別"
                  data-i18n-title="toolbar.srcPages.title"
                  data-i18n="toolbar.srcPages"
                  hidden
                >
                  原圖頁
                </button>
                <label className="toolbar-select-field" data-context-control hidden>
                  <span className="sr-only" data-i18n="toolbar.recogKind">
                    識別類型
                  </span>
                  <select
                    ref={selRecogKindRef}
                    title="識別為：自動判斷 / 簡譜 / 五線譜。改了就用剛才那份圖重新識別"
                    aria-label="識別類型"
                    data-i18n-title="toolbar.recogKind.title"
                    data-i18n-aria="toolbar.recogKind"
                    defaultValue="auto"
                  >
                    <option value="auto" data-i18n="recogKind.auto">
                      自動判斷
                    </option>
                    <option value="jianpu" data-i18n="recogKind.jianpuAs">
                      按簡譜識別
                    </option>
                    <option value="staff" data-i18n="recogKind.staffAs">
                      按五線譜識別
                    </option>
                  </select>
                  <span className="select-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </label>
              </div>

              <div className="tool-group context-tool-group playback-tools">
                <span className="tool-label" data-i18n="toolbar.listen">
                  試聽
                </span>
                <button
                  ref={btnPlayRef}
                  type="button"
                  className="icon-text playback-button"
                  aria-label="播放"
                  data-i18n-aria="play.play"
                >
                  <span className="playback-icon" aria-hidden="true">
                    <svg viewBox="0 0 10 10">
                      <path d="M2 0.8 L9.2 5 L2 9.2 Z" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="playback-label" data-i18n="play.play">
                    播放
                  </span>
                </button>
                <button
                  ref={btnStopRef}
                  type="button"
                  className="icon-button playback-stop"
                  title="停止試聽（回到曲首）"
                  aria-label="停止"
                  data-i18n-title="play.stop.title"
                  data-i18n-aria="play.stop"
                  disabled
                >
                  <svg className="playback-stop-icon" viewBox="0 0 10 10" aria-hidden="true">
                    <rect x="0.8" y="0.8" width="8.4" height="8.4" rx="1.2" fill="currentColor" />
                  </svg>
                </button>
                <input
                  ref={playProgressRef}
                  className="play-progress"
                  type="range"
                  min="0"
                  max="1"
                  step="any"
                  defaultValue="0"
                  aria-label="播放進度"
                  data-i18n-aria="play.progress"
                  disabled
                />
                <button
                  ref={playTimeRef}
                  type="button"
                  className="play-time"
                  aria-label="播放時間"
                  data-i18n-aria="play.time"
                >
                  0:00 / 0:00
                </button>
                <label className="select-wrap">
                  <select
                    ref={selSpeedRef}
                    aria-label="播放速度"
                    data-i18n-aria="play.speed"
                  />
                  <span className="select-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </label>
                <button
                  ref={btnLoopRef}
                  type="button"
                  className="playback-toggle"
                  aria-pressed="false"
                  title="循環播放：譜面上選了一段就循環這一段，沒選循環整首"
                  data-i18n-title="play.loop.title"
                  data-i18n="play.loop"
                >
                  循環
                </button>
                <button
                  ref={btnMetronomeRef}
                  type="button"
                  className="playback-toggle"
                  aria-pressed="false"
                  title="節拍器：試聽時每拍響一聲（小節第一拍高一些）"
                  data-i18n-title="play.metronome.title"
                  data-i18n="play.metronome"
                >
                  節拍
                </button>
              </div>

              <span className="toolbar-spacer" />

              <div
                className="tool-group mobile-view-switch"
                aria-label="行動裝置工作區檢視"
                data-i18n-aria="toolbar.mobileView"
              >
                <button
                  ref={btnMobileCodeRef}
                  type="button"
                  aria-pressed="false"
                  data-i18n="toolbar.mobileCode"
                >
                  原始碼
                </button>
                <button
                  ref={btnMobileScoreRef}
                  type="button"
                  className="active"
                  aria-pressed="true"
                  data-i18n="toolbar.mobileScore"
                >
                  預覽
                </button>
              </div>
            </div>

            <div ref={bodyRef} className="dolce-body">
              <section
                className="dolce-code-pane-shell workspace-pane"
                aria-label="樂譜原始碼"
                data-i18n-aria="pane.code"
              >
                <div className="pane-heading">
                  <span data-i18n="pane.code">樂譜原始碼</span>
                  <span ref={codePaneMetaRef} className="pane-meta">
                    JPWABC
                  </span>
                  <label
                    ref={docFormatFieldRef}
                    className="pane-select-field"
                    data-context-control
                    hidden
                  >
                    <span className="sr-only" data-i18n="pane.docFormat">
                      原始碼格式
                    </span>
                    <select
                      ref={selDocFormatRef}
                      title="切換原始碼格式（識別結果不重新識別；開啟的檔案切回「原文」可還原）"
                      aria-label="原始碼格式"
                      data-i18n-title="pane.docFormat.title"
                      data-i18n-aria="pane.docFormat"
                    />
                    <span className="select-chevron" aria-hidden="true">
                      ⌄
                    </span>
                  </label>
                  <span ref={docFormatNoteRef} className="pane-note" hidden />
                </div>
                <div ref={codePaneRef} className="dolce-code-pane" />
              </section>

              <div
                ref={splitCodeRef}
                className="pane-splitter dolce-split-code"
                role="separator"
                aria-orientation="vertical"
                title="拖曳調整寬度，雙擊復位"
                data-i18n-title="pane.splitter.title"
              />

              <section
                ref={scoreShellRef}
                className="dolce-score-pane-shell workspace-pane"
                aria-label="排版"
                data-i18n-aria="pane.score"
              >
                <div className="pane-heading">
                  <span data-i18n="pane.score">排版</span>
                  <div className="pane-heading-actions">
                    <span
                      ref={visualModeRef}
                      className="visual-mode"
                      title="可視化編輯：編輯模式（方塊游標）改選取的元素，插入模式（豎線游標）在游標處插入；Insert / Esc 切換"
                      data-i18n-title="pane.visualMode.title"
                      hidden
                    >
                      編輯
                    </span>
                    <button
                      ref={btnPaletteRef}
                      type="button"
                      className="palette-button"
                      aria-pressed="false"
                      title="記號面板：用滑鼠點唱名、八度、時值、記號、換行"
                      data-i18n-title="pane.palette.title"
                      data-i18n="pane.palette"
                    >
                      面板
                    </button>
                    <button
                      ref={btnBeatCheckRef}
                      type="button"
                      className="beat-check-button"
                      aria-pressed="true"
                      title="小節時值自動檢查：拍數與拍號不符的小節標紅"
                      data-i18n-title="pane.beatCheck.title"
                      data-i18n="pane.beatCheck"
                    >
                      拍
                    </button>
                    <button
                      ref={btnFormatMarksRef}
                      type="button"
                      className="format-marks-button"
                      aria-pressed="true"
                      title="顯示格式標記：換行符 ↵ 與換頁符 ⤓（Ctrl/⌘+Shift+M）"
                      data-i18n-title="pane.formatMarks.title"
                    >
                      ¶
                    </button>
                    <div
                      ref={viewModeSwitchRef}
                      className="preview-mode-switch"
                      aria-label="排版模式"
                      data-i18n-aria="view.aria"
                    >
                      <button
                        ref={btnViewExpandedRef}
                        type="button"
                        className="active"
                        aria-pressed="true"
                        title="反覆與多段歌詞逐段展開，一段一頁"
                        data-i18n-title="view.expanded.title"
                        data-i18n="view.expanded"
                      >
                        投影
                      </button>
                      <button
                        ref={btnViewOriginalRef}
                        type="button"
                        aria-pressed="false"
                        title="按原譜排一遍，多段歌詞疊排、反覆不展開"
                        data-i18n-title="view.original.title"
                        data-i18n="view.original"
                      >
                        簡譜
                      </button>
                      <button
                        ref={btnViewStaffRef}
                        type="button"
                        aria-pressed="false"
                        title="五線譜（需有 MusicXML 底本）"
                        data-i18n-title="view.staff.title"
                        data-i18n="view.staff"
                      >
                        五線譜
                      </button>
                      <button
                        ref={btnViewMixedRef}
                        type="button"
                        aria-pressed="false"
                        title="五線譜疊加簡譜層（需有 MusicXML 底本）"
                        data-i18n-title="view.mixed.title"
                        data-i18n="view.mixed"
                      >
                        混排
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  ref={visualPaletteRef}
                  className="visual-palette"
                  aria-label="記號面板"
                  data-i18n-aria="pane.paletteAria"
                  hidden
                />
                <div ref={scorePaneRef} className="dolce-score-pane" />
                <div ref={omrFollowRef} className="omr-follow" hidden />
                <div ref={omrSideRef} className="omr-side" hidden />
                <div
                  ref={splitSideRef}
                  className="pane-splitter pane-splitter-abs dolce-split-side"
                  role="separator"
                  aria-orientation="vertical"
                  title="拖曳調整寬度，雙擊復位"
                  data-i18n-title="pane.splitter.title"
                  hidden
                />
              </section>

              <section ref={startScreenRef} className="dolce-start-screen">
                <div className="start-content">
                  <div className="start-heading">
                    <span className="eyebrow" data-i18n="start.eyebrow">
                      開始創作
                    </span>
                    <h1 data-i18n="start.title">把樂譜帶進來，可編輯，可匯出</h1>
                    <p data-i18n="start.lead">
                      本機辨識、校對排版、簡譜與五線譜切換、線上試聽和多格式匯出。
                    </p>
                  </div>
                  <div className="start-modes">
                    <button
                      ref={btnStartImageRef}
                      type="button"
                      className="start-mode start-mode-primary"
                    >
                      <span className="mode-icon" aria-hidden="true">
                        <svg viewBox="0 0 32 32" fill="none">
                          <path
                            d="M24 10.6667C24 12.1394 22.8061 13.3333 21.3333 13.3333C19.8605 13.3333 18.6667 12.1394 18.6667 10.6667C18.6667 9.19391 19.8605 8 21.3333 8C22.8061 8 24 9.19391 24 10.6667Z"
                            fill="#fff"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M16.0765 1.66667H15.9235C12.8457 1.66665 10.4336 1.66664 8.55161 1.91967C6.62529 2.17865 5.10527 2.71911 3.91219 3.91219C2.71911 5.10527 2.17865 6.62529 1.91967 8.55161C1.66664 10.4336 1.66665 12.8456 1.66667 15.9235V16.0765C1.66665 19.1544 1.66664 21.5664 1.91967 23.4484C2.17865 25.3747 2.71911 26.8948 3.91219 28.0879C5.10527 29.2809 6.62529 29.8213 8.55161 30.0804C10.4336 30.3333 12.8456 30.3333 15.9235 30.3333H16.0765C19.1544 30.3333 21.5664 30.3333 23.4484 30.0804C25.3747 29.8213 26.8948 29.2809 28.0879 28.0879C29.2809 26.8948 29.8213 25.3747 30.0804 23.4484C30.3333 21.5664 30.3333 19.1544 30.3333 16.0765V15.9235C30.3333 12.8456 30.3333 10.4336 30.0804 8.55161C29.8213 6.62529 29.2809 5.10527 28.0879 3.91219C26.8948 2.71911 25.3747 2.17865 23.4484 1.91967C21.5664 1.66664 19.1544 1.66665 16.0765 1.66667ZM5.3264 5.3264C6.08593 4.56685 7.11356 4.131 8.81811 3.90183C10.5514 3.66879 12.829 3.66667 16 3.66667C19.1709 3.66667 21.4485 3.66879 23.1819 3.90183C24.8864 4.131 25.914 4.56685 26.6736 5.3264C27.4332 6.08593 27.8691 7.11356 28.0981 8.81811C28.3312 10.5514 28.3333 12.829 28.3333 16C28.3333 16.6003 28.3332 17.1685 28.3316 17.7072L28.0355 17.6663C24.2437 17.1412 20.774 19.1124 19.0072 22.0835C16.7279 16.3168 10.7046 12.3841 3.97431 13.3505L3.67329 13.3939C3.68844 11.5199 3.73824 10.0349 3.90183 8.81811C4.131 7.11356 4.56685 6.08593 5.3264 5.3264Z"
                            fill="#fff"
                          />
                        </svg>
                      </span>
                      <span className="mode-copy">
                        <strong data-i18n="start.image">圖片識譜</strong>
                        <span data-i18n="start.image.sub">上傳圖片，自動辨識</span>
                        <small>PNG · JPG · WEBP · PDF</small>
                      </span>
                      <span className="mode-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                    <button
                      ref={btnStartScoreRef}
                      type="button"
                      className="start-mode"
                    >
                      <span className="mode-icon mode-icon-score" aria-hidden="true">
                        <svg viewBox="0 0 32 32" fill="none">
                          <path
                            d="M11.3465 2.66668H20.6533C20.9633 2.6666 21.2009 2.66655 21.4087 2.68687C22.8857 2.83136 24.0948 3.71944 24.6075 4.91571H7.39237C7.90505 3.71944 9.11407 2.83136 10.5912 2.68687C10.7989 2.66655 11.0365 2.6666 11.3465 2.66668Z"
                            fill="#333"
                          />
                          <path
                            d="M8.41403 6.29749C6.55985 6.29749 5.03951 7.41716 4.53213 8.90255C4.52156 8.93351 4.51141 8.96464 4.50172 8.99591C5.03259 8.83515 5.58508 8.73012 6.14436 8.65843C7.58487 8.47375 9.40532 8.47384 11.52 8.47396H20.7095C22.8241 8.47384 24.6447 8.47375 26.0852 8.65843C26.6444 8.73012 27.1969 8.83515 27.7277 8.99591C27.7181 8.96464 27.708 8.93351 27.6973 8.90255C27.19 7.41716 25.6696 6.29749 23.8155 6.29749H8.41403Z"
                            fill="#333"
                          />
                          <path
                            d="M15 22.6667C15 22.1144 14.5523 21.6667 14 21.6667C13.4477 21.6667 13 22.1144 13 22.6667C13 23.2189 13.4477 23.6667 14 23.6667C14.5523 23.6667 15 23.2189 15 22.6667Z"
                            fill="#333"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M11.5632 10.0561H20.4368C24.9365 10.0561 27.1864 10.0561 28.4503 11.3718C29.714 12.6876 29.4167 14.7205 28.822 18.7861L28.258 22.6415C27.7916 25.8299 27.5585 27.424 26.3623 28.3787C25.166 29.3333 23.4016 29.3333 19.8728 29.3333H12.1271C8.5984 29.3333 6.83404 29.3333 5.63779 28.3787C4.44153 27.424 4.20835 25.8299 3.74197 22.6415L3.17801 18.7861C2.58331 14.7204 2.28596 12.6876 3.54976 11.3718C4.81356 10.0561 7.06344 10.0561 11.5632 10.0561ZM17 14C17 13.4477 16.5523 13 16 13C15.4477 13 15 13.4477 15 14V19.8373C14.6872 19.7268 14.3507 19.6667 14 19.6667C12.3431 19.6667 11 21.0099 11 22.6667C11 24.3235 12.3431 25.6667 14 25.6667C15.6568 25.6667 17 24.3235 17 22.6667V17.7596C17.8936 18.4845 19.0156 19 20 19C20.5523 19 21 18.5523 21 18C21 17.4477 20.5523 17 20 17C19.5928 17 18.8193 16.7085 18.1113 16.0804C17.4205 15.4675 17 14.7181 17 14Z"
                            fill="#333"
                          />
                        </svg>
                      </span>
                      <span className="mode-copy">
                        <strong data-i18n="start.score">匯入樂譜</strong>
                        <span data-i18n="start.score.sub">繼續編輯已有譜面</span>
                        <small data-i18n="start.score.formats">
                          123 · JPWABC · jianpu-ly · 文本譜 · MusicXML · ABC · .dolce
                        </small>
                      </span>
                      <span className="mode-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </div>
                  <div className="start-footer">
                    <span className="privacy-note">
                      <span aria-hidden="true">●</span>{" "}
                      <span data-i18n="start.privacy">圖片在本機識別，不會上傳</span>
                    </span>
                    <label className="start-kind">
                      <span data-i18n="start.recogKind">識別為</span>
                      <select
                        ref={selRecogKindStartRef}
                        aria-label="識別類型"
                        data-i18n-aria="toolbar.recogKind"
                        defaultValue="auto"
                      >
                        <option value="auto" data-i18n="recogKind.auto">
                          自動判斷
                        </option>
                        <option value="jianpu" data-i18n="recogKind.jianpu">
                          簡譜
                        </option>
                        <option value="staff" data-i18n="recogKind.staff">
                          五線譜
                        </option>
                      </select>
                    </label>
                    <label
                      className="start-kind"
                      title="選好圖之後先彈「原圖頁」：橫著拍的轉過來、頁邊裁掉、幾張圖排好順序，再開始識別"
                      data-i18n-title="start.adjustFirst.title"
                    >
                      <input ref={chkAdjustFirstRef} type="checkbox" />{" "}
                      <span data-i18n="start.adjustFirst">識別前先調整原圖</span>
                    </label>
                    <button
                      ref={btnStartSampleRef}
                      type="button"
                      className="sample-link"
                      data-i18n="start.sample"
                    >
                      查看範例樂譜
                    </button>
                  </div>
                  <div
                    ref={startFeedbackRef}
                    className="dolce-start-feedback"
                    hidden
                    role="alert"
                  />
                </div>
              </section>

              <div
                ref={recognitionProgressRef}
                className="dolce-recognition-progress"
                hidden
                aria-live="polite"
              >
                <div className="recognition-progress-card">
                  <span className="progress-spinner" aria-hidden="true" />
                  <div>
                    <strong data-i18n="start.progress">正在識別並生成排版</strong>
                    <span
                      ref={recognitionProgressDetailRef}
                      data-i18n="start.progress.sub"
                    >
                      完成後將直接顯示可編輯的樂譜
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <footer className="dolce-statusbar">
              <div
                ref={statusRef}
                className="status-text"
                role="status"
                aria-live="polite"
              />
              <div className="status-items">
                <span
                  ref={selInfoRef}
                  className="sel-info"
                  title="選中的元素：聲部、第幾小節第幾拍、音高、時值"
                  data-i18n-title="pane.selInfo.title"
                  hidden
                />
                <span
                  ref={beatCountRef}
                  className="beat-count"
                  title="點一下跳到下一處"
                  data-i18n-title="pane.beatCount.title"
                  hidden
                />
                <button
                  ref={btnDoubtRef}
                  type="button"
                  className="doubt-count"
                  title="識別時把握不大的音與歌詞字（核對檢視裡黃框標出）：點一下跳到下一處"
                  data-i18n-title="toolbar.doubt.title"
                  hidden
                />
                <span className="status-sep status-sep-code" aria-hidden="true" />
                <label
                  className="status-check"
                  title="顯示程式碼區（取消勾選收起，譜面佔滿；並排時原圖與排版稿各佔一半）"
                  data-i18n-title="status.code.title"
                >
                  <input ref={chkCodeRef} type="checkbox" defaultChecked />
                  <span data-i18n="status.code">原始碼</span>
                </label>
                <label ref={compareFieldRef} className="status-select-field" hidden>
                  <span className="status-label" data-i18n="status.recogView">
                    核對
                  </span>
                  <select
                    ref={selCompareRef}
                    title="核對方式"
                    aria-label="核對方式"
                    data-i18n-title="status.compare.title"
                    data-i18n-aria="status.compare.aria"
                    defaultValue="none"
                  >
                    <option value="none" data-i18n="status.compare.none">
                      不核對
                    </option>
                    <option value="side" data-i18n="toolbar.srcSide">
                      並排原圖
                    </option>
                    <option value="follow" data-i18n="toolbar.srcFollow">
                      原圖片段
                    </option>
                    <option value="floating" data-i18n="toolbar.recogView.floating">
                      附近浮動視窗
                    </option>
                    <option value="inplace" data-i18n="toolbar.recogView.inplace">
                      原位疊加
                    </option>
                    <option value="original" data-i18n="toolbar.recogView.original">
                      僅原圖
                    </option>
                  </select>
                  <span className="select-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </label>
                <div className="compare-legacy" hidden>
                  <button
                    ref={btnRecognizeRef}
                    type="button"
                    data-context-control
                    title="將識別結果與上傳原圖進行對照"
                    data-i18n-title="toolbar.recognize.title"
                    data-i18n="toolbar.recognize"
                    hidden
                  >
                    原圖對照
                  </button>
                  <button
                    ref={btnSrcSideRef}
                    type="button"
                    data-context-control
                    aria-pressed="false"
                    title="排版稿左邊鋪整頁原圖：選取的音框出來，點原圖上的音選取排版稿裡那個"
                    data-i18n-title="toolbar.srcSide.title"
                    data-i18n="toolbar.srcSide"
                    hidden
                  >
                    並排原圖
                  </button>
                  <button
                    ref={btnSrcFollowRef}
                    type="button"
                    data-context-control
                    aria-pressed="false"
                    title="在排版稿裡選取音符時，右下角小視窗顯示原圖上對應的那一行並框出這個音"
                    data-i18n-title="toolbar.srcFollow.title"
                    data-i18n="toolbar.srcFollow"
                    hidden
                  >
                    原圖片段
                  </button>
                  <label className="status-select-field" data-context-control hidden>
                    <span className="status-label" data-i18n="status.recogView">
                      核對
                    </span>
                    <select
                      ref={selRecogViewRef}
                      title="原圖對照方式"
                      aria-label="原圖對照方式"
                      data-i18n-title="toolbar.recogView"
                      data-i18n-aria="toolbar.recogView"
                      defaultValue="floating"
                    >
                      <option value="floating" data-i18n="toolbar.recogView.floating">
                        附近浮動視窗
                      </option>
                      <option value="inplace" data-i18n="toolbar.recogView.inplace">
                        原位疊加
                      </option>
                      <option value="original" data-i18n="toolbar.recogView.original">
                        僅原圖
                      </option>
                    </select>
                    <span className="select-chevron" aria-hidden="true">
                      ⌄
                    </span>
                  </label>
                </div>
                <span className="status-sep" aria-hidden="true" />
                <div className="tool-group">
                  <span className="tool-label" data-i18n="toolbar.zoom">
                    縮放
                  </span>
                  <button
                    ref={btnZoomOutRef}
                    type="button"
                    className="icon-button"
                    title="縮小 (Ctrl/⌘ -)"
                    aria-label="縮小"
                    data-i18n-title="toolbar.zoomOut.title"
                    data-i18n-aria="toolbar.zoomOut"
                  >
                    −
                  </button>
                  <button
                    ref={btnZoomResetRef}
                    type="button"
                    className="dolce-zoom-reset"
                    title="復位 (Ctrl/⌘ 0)"
                    data-i18n-title="toolbar.zoomReset.title"
                  >
                    100%
                  </button>
                  <button
                    ref={btnZoomInRef}
                    type="button"
                    className="icon-button"
                    title="放大 (Ctrl/⌘ +)"
                    aria-label="放大"
                    data-i18n-title="toolbar.zoomIn.title"
                    data-i18n-aria="toolbar.zoomIn"
                  >
                    ＋
                  </button>
                </div>
                <div className="tool-group">
                  <span className="tool-label" data-i18n="toolbar.page">
                    頁面
                  </span>
                  <button
                    ref={btnPrevRef}
                    type="button"
                    className="icon-button"
                    title="上一頁"
                    aria-label="上一頁"
                    data-i18n-title="toolbar.prev"
                    data-i18n-aria="toolbar.prev"
                  >
                    ‹
                  </button>
                  <button
                    ref={btnNextRef}
                    type="button"
                    className="icon-button"
                    title="下一頁"
                    aria-label="下一頁"
                    data-i18n-title="toolbar.next"
                    data-i18n-aria="toolbar.next"
                  >
                    ›
                  </button>
                </div>
              </div>
            </footer>
          </div>
          <svg id="measure-svg" width="0" height="0" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
};

export default DolceOmrWorkspace;
