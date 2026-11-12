import { asset } from "../dolce/common/asset";
import { setMeasureBackend } from "../dolce/common/measure";
import { browserMeasure, ensureFontsReady } from "../dolce/common/measure.browser";
import { MetaData } from "../dolce/smufl/smufl";
import { parse123, parseAbc } from "../dolce/abcfamily/parse";
import { emit123 } from "../dolce/abcfamily/emit123.entry";
import { emitAbc } from "../dolce/abcfamily/emitabc.entry";
import { musicXmlFormat } from "../dolce/editor/formats";
import { withPageMeta } from "../dolce/model/pagemeta";
import { scoreDocToMusicXml } from "../dolce/model/toxml";
import type { ScoreDoc } from "../dolce/model/doc";

export type ScoreFormat = "123" | "abc" | "musicxml";
export type ScoreViewMode = "original" | "expanded" | "staff" | "mixed";

let readyPromise: Promise<MetaData> | null = null;
let loadedFontsDoc: Document | null = null;

async function ensureBravuraFaces(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const hasFace = (family: string): boolean => {
    for (const face of document.fonts) {
      if (face.family.replace(/^['"]|['"]$/g, "") === family && face.status === "loaded") {
        return true;
      }
    }
    return false;
  };
  const register = async (family: string, relUrl: string): Promise<void> => {
    if (hasFace(family)) return;
    try {
      const face = new FontFace(family, `url(${asset(relUrl)})`);
      const loaded = await face.load();
      document.fonts.add(loaded);
    } catch {
      // Fallback gracefully if FontFace load is unsupported in a mock environment
    }
  };
  await Promise.all([
    register("Bravura", "redist/Bravura.woff2"),
    register("Bravura Text", "redist/BravuraText.otf"),
  ]);
}

/**
 * Ensures browser typography metrics, Bravura / Bravura Text fonts, and SMuFL metadata
 * are ready before layout/engraving runs. Safe across Astro ViewTransitions.
 */
export async function ensureDolceReady(): Promise<MetaData> {
  if (typeof document === "undefined") {
    throw new Error("Dolce 排版引擎只能在瀏覽器環境執行");
  }
  setMeasureBackend(browserMeasure);
  if (!readyPromise || loadedFontsDoc !== document) {
    loadedFontsDoc = document;
    readyPromise = (async () => {
      await ensureBravuraFaces();
      await ensureFontsReady([
        { family: "Bravura", size: 40 },
        { family: "Bravura Text", size: 20 },
      ]);
      return MetaData.shared();
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  } else {
    // Re-check fonts in case document changed or faces were cleared across ViewTransitions
    await ensureBravuraFaces();
  }
  return readyPromise;
}

export function parseScoreDoc(format: ScoreFormat, content: string): ScoreDoc {
  switch (format) {
    case "123":
      return parse123(content);
    case "abc":
      return parseAbc(content);
    case "musicxml":
      return musicXmlFormat.toScoreDoc(content);
  }
}

export function emitScoreDoc(format: ScoreFormat, doc: ScoreDoc): string {
  switch (format) {
    case "123":
      return emit123(withPageMeta(doc));
    case "abc":
      return emitAbc(withPageMeta(doc));
    case "musicxml":
      return scoreDocToMusicXml(doc);
  }
}

export function convertScoreContent(
  fromFormat: ScoreFormat,
  toFormat: ScoreFormat,
  content: string,
): string {
  if (fromFormat === toFormat) return content;
  const doc = parseScoreDoc(fromFormat, content);
  if (!doc.songs.length) {
    throw new Error("樂譜內容沒有可轉換的歌曲");
  }
  return emitScoreDoc(toFormat, doc);
}

export function scoreFormatLabel(format: ScoreFormat): string {
  switch (format) {
    case "123":
      return "123 簡譜";
    case "abc":
      return "ABC 五線譜";
    case "musicxml":
      return "MusicXML";
  }
}
