import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export interface SearchDoc {
  id: string;
  titleA: string;
  titleB: string;
  originalKey: string;
  bpm?: number;
  tags: string[];
  author: string;
  lyricsA: string;
  lyricsB: string;
}

export const GET: APIRoute = async () => {
  const songs = await getCollection('songs');

  const searchDocs: SearchDoc[] = songs.map((song) => {
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
      titleB: song.data.meta.title.b || '',
      originalKey: song.data.meta.originalKey || '',
      bpm: song.data.meta.bpm,
      tags: song.data.meta.tags || [],
      author: song.data.meta.author || '',
      lyricsA: lyricsALines.join(' '),
      lyricsB: lyricsBLines.join(' '),
    };
  });

  return new Response(JSON.stringify(searchDocs), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
