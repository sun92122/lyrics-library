import { CHROMATIC_SCALE } from "@/constants/keys";
import { HeadlessSession } from "../dolce/editor/headless";
import type { ScorePainter } from "../dolce/layout/painter";
import type { Diagnostic, Harmony, Key, Pitch, ScoreDoc, Song } from "../dolce/model/doc";
import { keyAlter, midiOfPitch, respellMeasure } from "../dolce/model/edit";
import { assignDegrees } from "../dolce/model/jianpu";
import { fifthsOfSpelling, tonicSpelling } from "../dolce/model/keyshift";
import { isXmlShaped } from "../dolce/model/xmlproject";
import { chordStepAlter } from "../dolce/score/harmonyparse";
import { MusicCommon } from "../dolce/score/jppitch";
import { ensureDolceReady, parseScoreDoc, type ScoreFormat, type ScoreViewMode } from "./runtime";

const DIATONIC_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type StepLetter = (typeof DIATONIC_STEPS)[number];

const STEP_SEMI: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const MODE_DEGREE_STR: Readonly<Record<string, string>> = {
  major: "1",
  ionian: "1",
  dorian: "2",
  phrygian: "3",
  lydian: "4",
  mixolydian: "5",
  minor: "6",
  aeolian: "6",
  locrian: "7",
};

const SHARP_CHROMATIC: readonly { step: StepLetter; alter: number }[] = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];

const FLAT_CHROMATIC: readonly { step: StepLetter; alter: number }[] = [
  { step: "C", alter: 0 },
  { step: "D", alter: -1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "G", alter: -1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
];

const AWKWARD_CHORD_SPELLING = new Set(["E#", "B#", "Fb", "Cb"]);

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Wraps circle-of-fifths index into [-5..6] (Db..F#, matching standard worship keys). */
function wrapFifths(fifths: number): number {
  return ((((fifths + 5) % 12) + 12) % 12) - 5;
}

function accToAlter(acc: string): number {
  let alter = 0;
  for (const ch of acc) {
    if (ch === "#" || ch === "♯") alter += 1;
    else if (ch === "b" || ch === "♭") alter -= 1;
  }
  return alter;
}

function alterToAcc(alter: number, unicode: boolean): string {
  if (alter > 0) return (unicode ? "♯" : "#").repeat(alter);
  if (alter < 0) return (unicode ? "♭" : "b").repeat(-alter);
  return "";
}

function stepAlterToSemi(step: string, alter: number): number {
  return mod12((STEP_SEMI[step] ?? 0) + alter);
}

function parseStepAlterName(name: string): { step: StepLetter; alter: number } {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) return { step: "C", alter: 0 };
  return {
    step: m[1] as StepLetter,
    alter: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0,
  };
}

function spellPitchClassForHarmony(
  pc: number,
  targetFifths: number,
): { step: StepLetter; alter: number } {
  const normPc = mod12(pc);
  for (const step of DIATONIC_STEPS) {
    const alter = keyAlter(step, targetFifths);
    if (stepAlterToSemi(step, alter) === normPc) {
      const label = `${step}${alter > 0 ? "#" : alter < 0 ? "b" : ""}`;
      if (!AWKWARD_CHORD_SPELLING.has(label)) {
        return { step, alter };
      }
    }
  }
  return parseStepAlterName(CHROMATIC_SCALE[normPc]!);
}

function spellMidi(midi: number, targetFifths: number, sign: 1 | -1): Pitch {
  const normPc = mod12(midi);
  for (const step of DIATONIC_STEPS) {
    const alter = keyAlter(step, targetFifths);
    if (stepAlterToSemi(step, alter) === normPc) {
      const octave = Math.floor((midi - ((STEP_SEMI[step] ?? 0) + alter)) / 12) - 1;
      return { step, alter, octave };
    }
  }
  const choice = (sign < 0 ? FLAT_CHROMATIC : SHARP_CHROMATIC)[normPc]!;
  const octave = Math.floor((midi - ((STEP_SEMI[choice.step] ?? 0) + choice.alter)) / 12) - 1;
  return { step: choice.step, alter: choice.alter, octave };
}

function effectiveKeyFifths(k: Key): number {
  if (k.fifths !== 0 || !k.spelling || k.spelling === "none") return k.fifths;
  const td = k.tonicDegree ?? MODE_DEGREE_STR[(k.mode ?? "").toLowerCase()];
  return fifthsOfSpelling(k.spelling, td) ?? 0;
}

function shiftDolceKey(k: Key, semitones: number): Key {
  if (k.spelling === "none" || semitones % 12 === 0) return { ...k };
  const curFifths = effectiveKeyFifths(k);
  const newFifths = wrapFifths(curFifths + semitones * 7);
  const next: Key = { ...k, fifths: newFifths };
  delete next.spelling;
  delete next.display;
  delete next.cancel;
  next.spelling = tonicSpelling(next);
  return next;
}

/**
 * Transposes a single root/chord part (without splitting slash bass).
 */
function transposeSingleChordToken(
  token: string,
  semitones: number,
  targetFifths: number,
): string {
  const leadSpace = /^\s*/.exec(token)?.[0] ?? "";
  const trailSpace = /\s*$/.exec(token)?.[0] ?? "";
  const trimmed = token.trim();
  if (!trimmed || /^(n\.?c\.?|none)$/i.test(trimmed)) return token;

  const parsed = chordStepAlter(trimmed);
  if (!parsed) return token;

  const origAcc = accToAlter(parsed.acc);
  const newPc = mod12(stepAlterToSemi(parsed.step, origAcc) + semitones);
  const { step, alter } = spellPitchClassForHarmony(newPc, targetFifths);
  const unicode = parsed.acc.includes("♯") || parsed.acc.includes("♭");
  const accOut = alterToAcc(alter, unicode);
  const rootOut = parsed.left ? `${accOut}${step}` : `${step}${accOut}`;
  return `${leadSpace}${rootOut}${trimmed.slice(parsed.len)}${trailSpace}`;
}

/**
 * Transposes a chord string while distinguishing slash bass notes (`D/#F`, `C6/9/E`)
 * from slash chord extensions (`C6/9`, `Fadd9/11`).
 */
export function transposeChordSymbol(
  chordText: string,
  semitones: number,
  targetFifths = 0,
): string {
  if (!chordText || semitones % 12 === 0) return chordText;
  const trimmed = chordText.trim();
  if (!trimmed || /^(n\.?c\.?|none)$/i.test(trimmed)) return chordText;

  const slashBass = /^(.*?)\/([#♯b♭]?[A-G][#♯b♭]?)\s*$/.exec(trimmed);
  if (slashBass) {
    const main = transposeSingleChordToken(slashBass[1]!, semitones, targetFifths);
    const bass = transposeSingleChordToken(slashBass[2]!, semitones, targetFifths);
    return `${main}/${bass}`;
  }
  return transposeSingleChordToken(chordText, semitones, targetFifths);
}

/**
 * Transposes a structured Dolce `Harmony` node (keeping `root`, `bass`, and `text` consistent).
 */
export function transposeHarmony(
  h: Harmony,
  semitones: number,
  targetFifths: number,
): Harmony {
  if (semitones % 12 === 0) return { ...h };

  if (!h.kind && h.text !== undefined) {
    const nextText = transposeChordSymbol(h.text, semitones, targetFifths);
    const parsed = chordStepAlter(nextText.trim());
    const nextRoot = parsed
      ? {
          step: parsed.step,
          alter: accToAlter(parsed.acc),
          ...(parsed.left ? { alterLeft: true } : {}),
        }
      : {
          ...spellPitchClassForHarmony(stepAlterToSemi(h.root.step, h.root.alter) + semitones, targetFifths),
          ...(h.root.alterLeft ? { alterLeft: true } : {}),
        };
    return {
      ...h,
      root: nextRoot,
      text: nextText,
    };
  }

  const nextRootSpell = spellPitchClassForHarmony(
    stepAlterToSemi(h.root.step, h.root.alter) + semitones,
    targetFifths,
  );
  const next: Harmony = {
    ...h,
    root: {
      step: nextRootSpell.step,
      alter: nextRootSpell.alter,
      ...(h.root.alterLeft ? { alterLeft: true } : {}),
    },
  };

  if (h.bass) {
    const nextBassSpell = spellPitchClassForHarmony(
      stepAlterToSemi(h.bass.step, h.bass.alter) + semitones,
      targetFifths,
    );
    next.bass = {
      step: nextBassSpell.step,
      alter: nextBassSpell.alter,
      ...(h.bass.alterLeft ? { alterLeft: true } : {}),
    };
  }

  if (h.text !== undefined) {
    next.text = transposeChordSymbol(h.text, semitones, targetFifths);
  }

  return next;
}

/**
 * Formats a Dolce `Key` to the app's suffix key convention (e.g. `"G"`, `"Bb"`, `"F#m"`).
 */
export function keyToDisplayName(key?: Key): string | undefined {
  if (!key || key.spelling === "none") return undefined;
  let spelling = tonicSpelling(key).trim();
  if (!spelling || spelling === "none") return undefined;

  spelling = spelling
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/^([#b])([A-G])$/, "$2$1");

  const isMinor =
    (key.mode ?? "").toLowerCase() === "minor" ||
    (key.mode ?? "").toLowerCase() === "aeolian" ||
    key.tonicDegree === "6";

  if (isMinor && !spelling.endsWith("m")) {
    return `${spelling}m`;
  }
  return spelling;
}

/**
 * Extracts the primary effective key display name from a `ScoreDoc`.
 */
export function extractEffectiveKey(doc: ScoreDoc): string | undefined {
  const song = doc.songs[0];
  if (!song) return undefined;
  if (song.key && song.key.spelling !== "none") {
    return keyToDisplayName(song.key);
  }
  for (const part of song.parts) {
    for (const measure of part.measures) {
      if (measure.attrs?.key && measure.attrs.key.spelling !== "none") {
        return keyToDisplayName(measure.attrs.key);
      }
    }
  }
  if (song.parts.length > 0 && song.parts.some((p) => p.measures.length > 0)) {
    return keyToDisplayName({ fifths: 0 });
  }
  return undefined;
}

function transposeSongInPlace(song: Song, format: ScoreFormat, semitones: number): void {
  const fixedPitch = format === "abc" || format === "musicxml" || isXmlShaped(song);
  const hadSongKey = !!song.key;

  if (song.key) {
    song.key = shiftDolceKey(song.key, semitones);
  } else {
    const firstAttrKey = song.parts[0]?.measures[0]?.attrs?.key;
    if (!firstAttrKey) {
      song.key = shiftDolceKey({ fifths: 0 }, semitones);
    }
  }

  for (const part of song.parts) {
    let activeKey: Key = song.key ? { ...song.key } : { fifths: 0 };

    for (let mi = 0; mi < part.measures.length; mi++) {
      const measure = part.measures[mi]!;
      if (measure.attrs?.key) {
        measure.attrs.key = shiftDolceKey(measure.attrs.key, semitones);
        activeKey = measure.attrs.key;
        if (mi === 0 && !hadSongKey && !song.key) {
          song.key = { ...measure.attrs.key };
        }
      }
      const measureStartKey = activeKey;
      const measureFifths = effectiveKeyFifths(activeKey);
      const sign: 1 | -1 =
        measureFifths !== 0 ? (measureFifths > 0 ? 1 : -1) : semitones < 0 ? -1 : 1;

      if (measure.laterAttrs) {
        for (const la of measure.laterAttrs) {
          if (la.attrs.key) {
            la.attrs.key = shiftDolceKey(la.attrs.key, semitones);
            activeKey = la.attrs.key;
          }
        }
      }

      for (const el of measure.elements) {
        if (el.harmony) {
          el.harmony = transposeHarmony(el.harmony, semitones, measureFifths);
        }
        if (el.kind !== "chord") continue;
        if (el.laterHarmonies) {
          el.laterHarmonies = el.laterHarmonies.map((lh) =>
            transposeHarmony(lh, semitones, measureFifths),
          );
        }
        if (el.sustains) {
          for (const su of el.sustains) {
            if (su.harmony) {
              su.harmony = transposeHarmony(su.harmony, semitones, measureFifths);
            }
          }
        }
        for (const note of el.notes) {
          if (!fixedPitch) {
            // Movable-do: preserve scale degree (`note.degree`) and recompute sounding pitch from key.
            delete note.pitch;
          } else if (note.pitch) {
            const shiftedMidi = midiOfPitch(note.pitch) + semitones;
            note.pitch = spellMidi(shiftedMidi, measureFifths, sign);
          }
        }
      }

      if (fixedPitch) {
        respellMeasure(measure, measureStartKey);
      }
    }

    if (fixedPitch) {
      const initialKey: Key =
        song.key ?? part.measures[0]?.attrs?.key ?? { fifths: 0 };
      assignDegrees(part, initialKey);
    }
  }
}

/**
 * Clones `doc` and transposes it by `semitones`.
 * - `.123` (movable-do): shifts key signatures and chords; preserves scale degrees.
 * - `.abc` / `.musicxml` (fixed-pitch): shifts pitches, respells accidentals, shifts keys/chords,
 *   and recalculates jianpu degrees via `assignDegrees`.
 */
export function transposeScoreDoc(
  doc: ScoreDoc,
  format: ScoreFormat,
  semitones: number,
): ScoreDoc {
  const cloned = structuredClone(doc);
  if (semitones % 12 === 0) return cloned;
  for (const song of cloned.songs) {
    transposeSongInPlace(song, format, semitones);
  }
  return cloned;
}

export interface RenderedScoreSession {
  session: HeadlessSession;
  painter: ScorePainter;
  renderedDoc: ScoreDoc | null;
  pages: SVGSVGElement[];
  diagnostics: Diagnostic[];
}

export async function renderScoreSession(opts: {
  format: ScoreFormat;
  content: string;
  semitones?: number;
  view: ScoreViewMode;
}): Promise<RenderedScoreSession> {
  const meta = await ensureDolceReady();
  const parsed = parseScoreDoc(opts.format, opts.content);
  const semitones = opts.semitones ?? 0;
  const doc =
    semitones % 12 !== 0 ? transposeScoreDoc(parsed, opts.format, semitones) : parsed;

  const session = new HeadlessSession(meta);
  session.loadDoc(opts.format, doc);
  await session.setViewMode(opts.view);

  const pages: SVGSVGElement[] = [];
  for (let k = 0; k < session.painter.pageCount; k++) {
    pages.push(session.painter.renderPage(k));
  }

  return {
    session,
    painter: session.painter,
    renderedDoc: session.renderedScoreDoc,
    pages,
    diagnostics: parsed.diagnostics,
  };
}

export { MusicCommon };
