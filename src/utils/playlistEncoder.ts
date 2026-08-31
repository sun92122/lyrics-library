import LZString from 'lz-string';

export interface PlaylistItem {
  id: string; // 歌曲 ID
  k?: string; // 自訂使用調性 (例: "A")
  flow?: string[]; // 段落自訂排程 (例: ["V1", "C", "V2", "C", "Tag"])
  note?: string; // 敬拜備註 (例: "開頭鋼琴引導由弱漸強")
}

export interface PlaylistPayload {
  t?: string; // 活動/聚會名稱 (例: "2026-08-30 主日敬拜")
  d?: string; // 日期 (例: "2026-08-30")
  s: PlaylistItem[];
}

/**
 * Encodes a playlist payload into an LZ-String compressed URI component.
 */
export function encodePlaylist(payload: PlaylistPayload): string {
  const json = JSON.stringify(payload);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decodes an LZ-String encoded component back into a PlaylistPayload.
 */
export function decodePlaylist(encoded: string): PlaylistPayload | null {
  if (!encoded) return null;
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;
    const parsed = JSON.parse(decompressed);
    if (parsed && Array.isArray(parsed.s)) {
      return parsed as PlaylistPayload;
    }
    return null;
  } catch (err) {
    console.error('Failed to decode playlist:', err);
    return null;
  }
}

/**
 * Formats a playlist into a clean messaging outline (e.g. for LINE, Telegram, Discord).
 */
export function formatPlaylistOutline(
  payload: PlaylistPayload,
  songMap: Map<string, { titleA: string; titleB?: string; originalKey?: string }>
): string {
  const lines: string[] = [];
  lines.push(`🎵 敬拜歌單：${payload.t || '主日敬拜'}`);
  if (payload.d) {
    lines.push(`📅 日期：${payload.d}`);
  }
  lines.push('────────────────────────');

  payload.s.forEach((item, index) => {
    const song = songMap.get(item.id);
    const title = song ? song.titleA : item.id;
    const keyInfo = item.k
      ? `[調性: ${item.k}]`
      : song?.originalKey
      ? `[原調: ${song.originalKey}]`
      : '';

    lines.push(`${index + 1}. ${title} ${keyInfo}`);

    if (item.flow && item.flow.length > 0) {
      lines.push(`   ▸ 流程：${item.flow.join(' ➔ ')}`);
    }

    if (item.note) {
      lines.push(`   ▸ 備註：${item.note}`);
    }
  });

  lines.push('────────────────────────');
  return lines.join('\n').trim();
}
