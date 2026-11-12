import { FLOW_ALIASES, FLOW_STYLE } from "@/constants/flow";
import type { Creator, Lyric, Part, ScoreDoc, Song } from "../dolce/model/doc";
import { extractEffectiveKey } from "./transpose";

export interface ExtractedSection {
  name: string;
  lines: { a: string; b?: string }[];
}

export interface ExtractedSongContent {
  titleA?: string;
  titleB?: string;
  author?: string;
  originalKey?: string;
  bpm?: number;
  sections: ExtractedSection[];
}

const CREATOR_LABELS: Readonly<Record<string, string>> = {
  composer: "曲",
  lyricist: "詞",
  arranger: "編曲",
  translator: "譯詞",
  "words-and-music": "詞、曲",
  poet: "詞",
  music: "曲",
  words: "詞",
  transcriber: "記譜",
};

const CANONICAL_SECTION_SET = new Set(
  Object.keys(FLOW_STYLE).filter((k) => k.startsWith("$")),
);

const CJK_CHAR_RE =
  /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

function formatCreators(creators: readonly Creator[]): string | undefined {
  const lines: string[] = [];
  for (const c of creators) {
    const text = c.text?.trim();
    if (!text) continue;
    const type = (c.type ?? "").trim().toLowerCase();
    const label = CREATOR_LABELS[type];
    if (label && !text.startsWith(label) && !/[：:]/.test(text.slice(0, 6))) {
      lines.push(`${label}：${text}`);
    } else {
      lines.push(text);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function extractBpm(song: Song): number | undefined {
  if (song.tempos?.length) {
    for (const tempo of song.tempos) {
      if (typeof tempo === "number" && Number.isFinite(tempo) && tempo >= 20 && tempo <= 300) {
        if (song.tempoBeat && song.tempoBeat.den > 0) {
          return Math.round(((tempo * song.tempoBeat.num) / song.tempoBeat.den) * 4);
        }
        return Math.round(tempo);
      }
    }
  }
  for (const part of song.parts) {
    for (const measure of part.measures) {
      for (const dir of measure.directions ?? []) {
        const pm = dir.tempo?.perMinute ?? dir.sound?.tempo;
        if (typeof pm === "number" && Number.isFinite(pm) && pm >= 20 && pm <= 300) {
          return Math.round(pm);
        }
      }
    }
  }
  return undefined;
}

/**
 * Normalizes a Dolce section mark / rehearsal label to a canonical `$` flow tag
 * accepted by `SongBuilder` (`$V`, `$V1`..`$V6`, `$C`, `$C1`..`$C4`, `$B`, `$PC`, etc.).
 */
function resolveSectionTag(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^#+\s*/, "")
    .replace(/[:：]\s*$/, "")
    .trim();
  if (!stripped) return null;

  if (CANONICAL_SECTION_SET.has(stripped)) return stripped;

  const lower = stripped.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const noDollar = stripped.startsWith("$") ? stripped.slice(1) : stripped;
  const noDollarLower = noDollar.toLowerCase();
  const noDollarCompact = noDollarLower.replace(/\s+/g, "");

  const match =
    FLOW_ALIASES[stripped] ||
    FLOW_ALIASES[lower] ||
    FLOW_ALIASES[compact] ||
    FLOW_ALIASES[noDollar] ||
    FLOW_ALIASES[noDollarLower] ||
    FLOW_ALIASES[noDollarCompact];

  if (match && CANONICAL_SECTION_SET.has(match)) return match;
  return null;
}

function appendSyllable(
  buf: { text: string; needsSpaceAfter: boolean },
  syllable: Lyric,
): void {
  const lead = syllable.leadingPunctuation ?? "";
  let core = (syllable.text ?? "").trim();
  const trail = syllable.trailingPunctuation ?? "";

  if (core === "-" || core === "_" || core === "—") {
    core = "";
  }
  const continuesWord =
    syllable.syllabic === "begin" || syllable.syllabic === "middle";
  if (continuesWord && core.length > 1 && core.endsWith("-")) {
    core = core.slice(0, -1);
  }

  const piece = `${lead}${core}${trail}`;
  if (!piece) return;

  if (buf.text.length > 0 && buf.needsSpaceAfter) {
    const firstChar = piece[0]!;
    const lastChar = buf.text[buf.text.length - 1]!;
    if (!CJK_CHAR_RE.test(firstChar) || !CJK_CHAR_RE.test(lastChar)) {
      if (!/[(\[《「『（\s-]/.test(lastChar) && !/^[,.!?;:)\]》」』），。！？、；：]/.test(firstChar)) {
        buf.text += " ";
      }
    }
  }

  buf.text += piece;
  buf.needsSpaceAfter = !continuesWord;
}

function splitLongTextLine(line: string): string[] {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  // Split at explicit sentence-end punctuation if a long line bundles multiple clauses
  return normalized
    .split(/(?<=[。！？；]|[!?;]\s)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickLyricPart(song: Song): Part | undefined {
  return (
    song.parts.find((part) =>
      part.measures.some((m) =>
        m.elements.some((el) => el.kind === "chord" && (el.lyrics?.length ?? 0) > 0),
      ),
    ) ?? song.parts[0]
  );
}

function maxVerseNumber(part: Part): number {
  let max = 0;
  for (const m of part.measures) {
    for (const el of m.elements) {
      if (el.kind !== "chord") continue;
      for (const l of el.lyrics ?? []) {
        max = Math.max(max, l.numberTo ?? l.number);
      }
    }
  }
  return max;
}

function lyricMatchingVerse(
  lyrics: readonly Lyric[] | undefined,
  verse: number,
): Lyric | null {
  if (!lyrics?.length) return null;
  for (const l of lyrics) {
    const from = l.number;
    const to = l.numberTo ?? l.number;
    if (l.refrain && verse === 1) return l;
    if (!l.refrain && verse >= from && verse <= to) return l;
  }
  return null;
}

function extractSections(song: Song): ExtractedSection[] {
  const part = pickLyricPart(song);
  if (!part) return [];

  const totalVerses = Math.max(1, maxVerseNumber(part));
  const markBefore = new Map<number, string>();
  for (const sm of song.sectionMarks ?? []) {
    if (!markBefore.has(sm.before)) {
      markBefore.set(sm.before, sm.name);
    }
  }

  const outSections: ExtractedSection[] = [];
  let emittedRefrain = false;
  let genericVerseCount = 0;

  const ensureSection = (name: string): ExtractedSection => {
    const existing = outSections[outSections.length - 1];
    if (existing && existing.name === name) return existing;
    const created: ExtractedSection = { name, lines: [] };
    outSections.push(created);
    return created;
  };

  for (let verse = 1; verse <= totalVerses; verse++) {
    const defaultVerseTag =
      totalVerses > 1
        ? verse <= 6
          ? `$V${verse}`
          : `$V`
        : "$V";

    let currentTag = defaultVerseTag;
    let currentBuf = { text: "", needsSpaceAfter: false };
    let currentIsRefrain = false;

    const flushLine = () => {
      const text = currentBuf.text;
      currentBuf = { text: "", needsSpaceAfter: false };
      if (!text.trim()) return;
      if (currentIsRefrain && emittedRefrain && verse > 1) return;

      const targetTag = currentIsRefrain ? "$C" : currentTag;
      const lines = splitLongTextLine(text);
      if (!lines.length) return;
      const sec = ensureSection(targetTag);
      for (const l of lines) {
        sec.lines.push({ a: l });
      }
    };

    for (let mi = 0; mi < part.measures.length; mi++) {
      const measure = part.measures[mi]!;
      if (mi > 0 && measure.print?.newSystem) {
        flushLine();
      }

      const dirsAt = new Map<number, string[]>();
      for (const dir of measure.directions ?? []) {
        if ((dir.type === "rehearsal" || dir.type === "words") && dir.text) {
          const resolved = resolveSectionTag(dir.text);
          if (resolved) {
            const at = dir.afterElements ?? 0;
            const list = dirsAt.get(at) ?? [];
            list.push(resolved);
            dirsAt.set(at, list);
          }
        }
      }

      const applyDirTags = (atIndex: number) => {
        for (const resolved of dirsAt.get(atIndex) ?? []) {
          flushLine();
          currentTag = resolved;
          currentIsRefrain = resolved.startsWith("$C");
        }
      };

      applyDirTags(0);

      for (let elIdx = 0; elIdx < measure.elements.length; elIdx++) {
        if (elIdx > 0) applyDirTags(elIdx);
        const el = measure.elements[elIdx]!;
        const smName = markBefore.get(el.id);
        if (smName) {
          flushLine();
          const resolved = resolveSectionTag(smName);
          if (resolved) {
            currentTag = resolved;
          } else {
            genericVerseCount += 1;
            currentTag = genericVerseCount <= 6 ? `$V${genericVerseCount}` : "$V";
          }
          currentIsRefrain = currentTag.startsWith("$C");
        }

        if (el.kind !== "chord") continue;
        const lyr = lyricMatchingVerse(el.lyrics, verse);
        if (!lyr) continue;

        const isRef = Boolean(lyr.refrain);
        if (isRef !== currentIsRefrain && currentBuf.text.trim()) {
          flushLine();
        }
        currentIsRefrain = isRef;
        appendSyllable(currentBuf, lyr);
      }

      if (measure.elements.length > 0) {
        applyDirTags(measure.elements.length);
      }
    }

    flushLine();
    if (outSections.some((s) => s.name === "$C")) {
      emittedRefrain = true;
    }
  }

  // Merge adjacent sections only when they have lines; drop empty sections
  return outSections.filter((s) => s.lines.length > 0);
}

/**
 * Extracts title, subtitles, creator attribution, key signature, tempo (BPM),
 * and structured lyric sections from a parsed `ScoreDoc`.
 */
export function extractSongMetaAndLyricsFromScore(doc: ScoreDoc): ExtractedSongContent {
  const song = doc.songs[0];
  if (!song) {
    return { sections: [] };
  }

  const creditTitle = song.credits?.find((c) => c.type === "title")?.text?.trim();
  const creditSubtitle = song.credits?.find((c) => c.type === "subtitle")?.text?.trim();

  const titleA =
    song.work?.title?.trim() ||
    song.work?.movementTitle?.trim() ||
    creditTitle ||
    undefined;

  const titleB =
    song.work?.subtitles?.map((s) => s.trim()).find(Boolean) ||
    song.meta?.subtitle?.map((s) => s.trim()).find(Boolean) ||
    creditSubtitle ||
    undefined;

  const creditAuthors = (song.credits ?? [])
    .filter((c) => c.type === "composer" || c.type === "lyricist")
    .map((c) => c.text.trim())
    .filter(Boolean);

  const author =
    formatCreators(song.identification?.creators ?? []) ||
    (creditAuthors.length ? creditAuthors.join("\n") : undefined);

  const originalKey = extractEffectiveKey(doc);
  const bpm = extractBpm(song);
  const sections = extractSections(song);

  return {
    ...(titleA ? { titleA } : {}),
    ...(titleB ? { titleB } : {}),
    ...(author ? { author } : {}),
    ...(originalKey ? { originalKey } : {}),
    ...(bpm !== undefined ? { bpm } : {}),
    sections,
  };
}
