import type { SongData, SectionItem } from "@/content.config";
import { getFlowName } from "@/constants/flow";

export type LanguageMode = "a" | "b" | "both";
export type LayoutMode = "segmented" | "continuous";

export interface FormatLyricsOptions {
  languageMode: LanguageMode;
  layoutMode: LayoutMode;
  includeTitle?: boolean;
}

/**
 * Formats a song's lyrics into plain text according to language and layout modes.
 */
export function formatLyricsText(
  song: SongData,
  options: FormatLyricsOptions,
): string {
  const { languageMode, layoutMode, includeTitle = false } = options;
  const blocks: string[] = [];

  if (includeTitle) {
    let titleStr = song.meta.title.a;
    if (languageMode === "b" && song.meta.title.b) {
      titleStr = song.meta.title.b;
    } else if (languageMode === "both" && song.meta.title.b) {
      titleStr = `${song.meta.title.a} / ${song.meta.title.b}`;
    }
    blocks.push(titleStr);
    if (song.meta.author) {
      blocks.push(`詞曲：${song.meta.author}`);
    }
    blocks.push("");
  }

  song.sections.forEach((section) => {
    const sectionLines: string[] = [];

    if (layoutMode === "segmented") {
      const header = `[${getFlowName(section.name)}]`;
      sectionLines.push(header);
    }

    section.lines.forEach((line) => {
      if (languageMode === "a") {
        if (line.a) sectionLines.push(line.a);
      } else if (languageMode === "b") {
        if (line.b) {
          sectionLines.push(line.b);
        } else if (line.a) {
          sectionLines.push(line.a);
        }
      } else if (languageMode === "both") {
        if (line.a) sectionLines.push(line.a);
        if (line.b) sectionLines.push(line.b);
      }
    });

    if (sectionLines.length > 0) {
      blocks.push(sectionLines.join("\n"));
    }
  });

  return blocks.join("\n\n").trim();
}
