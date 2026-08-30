import type { SongData, SectionItem } from '@/content/config';

export type LanguageMode = 'a' | 'b' | 'both';
export type LayoutMode = 'segmented' | 'continuous';

export const SECTION_NAMES: Record<string, { zh: string; en: string }> = {
  verse: { zh: '主歌', en: 'Verse' },
  chorus: { zh: '副歌', en: 'Chorus' },
  bridge: { zh: '橋段', en: 'Bridge' },
  'pre-chorus': { zh: '副歌前段', en: 'Pre-Chorus' },
  tag: { zh: '結尾句', en: 'Tag' },
  outro: { zh: '尾奏', en: 'Outro' },
};

export function getSectionTitle(section: SectionItem, lang: 'zh' | 'en' = 'zh'): string {
  const conf = SECTION_NAMES[section.type] || { zh: section.type, en: section.type };
  const baseName = lang === 'en' ? conf.en : conf.zh;
  if (section.index !== undefined) {
    return `${baseName} ${section.index}`;
  }
  return baseName;
}

export interface FormatLyricsOptions {
  languageMode: LanguageMode;
  layoutMode: LayoutMode;
  includeTitle?: boolean;
}

/**
 * Formats a song's lyrics into plain text according to language and layout modes.
 */
export function formatLyricsText(song: SongData, options: FormatLyricsOptions): string {
  const { languageMode, layoutMode, includeTitle = false } = options;
  const blocks: string[] = [];

  if (includeTitle) {
    let titleStr = song.meta.title.a;
    if (languageMode === 'b' && song.meta.title.b) {
      titleStr = song.meta.title.b;
    } else if (languageMode === 'both' && song.meta.title.b) {
      titleStr = `${song.meta.title.a} / ${song.meta.title.b}`;
    }
    blocks.push(titleStr);
    if (song.meta.author) {
      blocks.push(`詞曲：${song.meta.author}`);
    }
    blocks.push('');
  }

  song.sections.forEach((section) => {
    const sectionLines: string[] = [];

    if (layoutMode === 'segmented') {
      const header = `[${getSectionTitle(section)}]`;
      sectionLines.push(header);
    }

    section.lines.forEach((line) => {
      if (languageMode === 'a') {
        if (line.a) sectionLines.push(line.a);
      } else if (languageMode === 'b') {
        if (line.b) {
          sectionLines.push(line.b);
        } else if (line.a) {
          sectionLines.push(line.a);
        }
      } else if (languageMode === 'both') {
        if (line.a) sectionLines.push(line.a);
        if (line.b) sectionLines.push(line.b);
      }
    });

    if (sectionLines.length > 0) {
      blocks.push(sectionLines.join('\n'));
    }
  });

  return blocks.join('\n\n').trim();
}
