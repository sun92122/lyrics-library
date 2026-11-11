export interface SearchDoc {
  id: string;
  titleA: string;
  titleB: string;
  originalKey: string;
  bpm?: number | undefined;
  tags: string[];
  author: string;
  lyricsA: string;
  lyricsB: string;
}

export type TagCount = [string, number];

export interface SongEntryLike {
  id: string;
  data: {
    meta: {
      title: {
        a: string;
        b?: string | undefined;
      };
      originalKey?: string | undefined;
      bpm?: number | undefined;
      tags?: string[] | undefined;
      author?: string | undefined;
    };
    sections: Array<{
      lines: Array<{
        a: string;
        b?: string | undefined;
      }>;
    }>;
  };
}

const zhTwCollator = new Intl.Collator("zh-Hant-TW", { numeric: true });

export function compareSearchDocs(
  a: Pick<SearchDoc, "titleA" | "id">,
  b: Pick<SearchDoc, "titleA" | "id">,
): number {
  return (
    zhTwCollator.compare(a.titleA, b.titleA) ||
    a.titleA.localeCompare(b.titleA, "en") ||
    a.id.localeCompare(b.id, "en")
  );
}

export function compareTagCounts(a: TagCount, b: TagCount): number {
  return (
    b[1] - a[1] ||
    zhTwCollator.compare(a[0], b[0]) ||
    a[0].localeCompare(b[0], "en")
  );
}

export function buildSearchDocs(songs: readonly SongEntryLike[]): SearchDoc[] {
  return songs
    .map((song) => {
      const lyricsALines: string[] = [];
      const lyricsBLines: string[] = [];

      song.data.sections.forEach((sec) => {
        sec.lines.forEach((line) => {
          if (line.a) lyricsALines.push(line.a);
          if (line.b) lyricsBLines.push(line.b);
        });
      });

      return {
        id: song.id,
        titleA: song.data.meta.title.a,
        titleB: song.data.meta.title.b || "",
        originalKey: song.data.meta.originalKey || "",
        bpm: song.data.meta.bpm,
        tags: song.data.meta.tags || [],
        author: song.data.meta.author || "",
        lyricsA: lyricsALines.join(" "),
        lyricsB: lyricsBLines.join(" "),
      };
    })
    .sort(compareSearchDocs);
}

export function extractSortedTags(docs: readonly SearchDoc[]): TagCount[] {
  const counts = new Map<string, number>();
  docs.forEach((doc) => {
    doc.tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1) // Only include tags with more than one song
    .sort(compareTagCounts);
}
