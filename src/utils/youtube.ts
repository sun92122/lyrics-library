export interface YoutubeAssetLike {
  type: string;
  name: string;
  url: string;
}

export interface SongWithYoutubeAssets {
  id: string;
  meta: {
    title: { a: string; b?: string };
    assets?: YoutubeAssetLike[];
  };
}

export interface PlaylistItemLike {
  id: string;
  t?: "H" | "D" | "S" | null;
}

export interface ParsedYoutubeTarget {
  kind: "playlist" | "video";
  embedUrl: string;
  externalUrl: string;
  listId?: string;
  videoIds?: string[];
  startSeconds?: number;
}

export interface AutoYoutubeTrack {
  songId: string;
  songTitle: string;
  assetName: string;
  assetUrl: string;
  videoId: string;
  startSeconds?: number;
}

export interface AutoYoutubePlaylistResult {
  embedUrl: string | null;
  externalUrl: string | null;
  tracks: AutoYoutubeTrack[];
  skippedSongTitles: string[];
}

const YOUTUBE_ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_REGEX = /^[A-Za-z0-9_-]{6,100}$/;
const RAW_PLAYLIST_ID_REGEX =
  /^(PL|UU|LL|FL|OLAK5uy_|RD|TLGG)[A-Za-z0-9_-]{8,90}$/;

function isValidVideoId(id: string | null | undefined): id is string {
  if (!id) return false;
  const trimmed = id.trim();
  if (trimmed.toLowerCase() === "videoseries") return false;
  return VIDEO_ID_REGEX.test(trimmed);
}

function isValidPlaylistId(id: string | null | undefined): id is string {
  if (!id) return false;
  return PLAYLIST_ID_REGEX.test(id.trim());
}

/**
 * Parses YouTube time parameters (`t` or `start`), supporting pure seconds, `167s`, or `1h2m3s`.
 */
export function parseYoutubeStartSeconds(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;

  if (/^\d+s?$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    return Number.isFinite(secs) && secs > 0 ? secs : undefined;
  }

  const hmsMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const hours = Number.parseInt(hmsMatch[1] || "0", 10);
    const mins = Number.parseInt(hmsMatch[2] || "0", 10);
    const secs = Number.parseInt(hmsMatch[3] || "0", 10);
    const total = hours * 3600 + mins * 60 + secs;
    return Number.isFinite(total) && total > 0 ? total : undefined;
  }

  return undefined;
}

function normalizeUrlWithProtocol(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const urlObj = new URL(withProtocol);
    if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
      return null;
    }
    if (!YOUTUBE_ALLOWED_HOSTS.has(urlObj.hostname.toLowerCase())) {
      return null;
    }
    return urlObj;
  } catch {
    return null;
  }
}

function extractVideoIdFromUrlObj(urlObj: URL): string | null {
  const host = urlObj.hostname.toLowerCase();
  const segments = urlObj.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const candidate = segments[0];
    return isValidVideoId(candidate) ? candidate : null;
  }

  const vParam = urlObj.searchParams.get("v") || urlObj.searchParams.get("vi");
  if (isValidVideoId(vParam)) {
    return vParam.trim();
  }

  if (
    segments.length >= 2 &&
    (segments[0] === "embed" ||
      segments[0] === "shorts" ||
      segments[0] === "live" ||
      segments[0] === "v")
  ) {
    const candidate = segments[1];
    return isValidVideoId(candidate) ? candidate : null;
  }

  return null;
}

/**
 * Extracts YouTube video ID and optional start timestamp from a video URL.
 */
export function extractYoutubeVideoInfo(
  rawUrl: string,
): { videoId: string; startSeconds?: number } | null {
  const urlObj = normalizeUrlWithProtocol(rawUrl);
  if (!urlObj) return null;

  const videoId = extractVideoIdFromUrlObj(urlObj);
  if (!videoId) return null;

  const startSeconds = parseYoutubeStartSeconds(
    urlObj.searchParams.get("start") ?? urlObj.searchParams.get("t"),
  );

  return {
    videoId,
    ...(startSeconds !== undefined ? { startSeconds } : {}),
  };
}

/**
 * Returns the first YouTube asset of a song that yields a valid YouTube video ID.
 */
export function getFirstSongYoutubeAsset(assets?: YoutubeAssetLike[]): {
  asset: YoutubeAssetLike;
  videoId: string;
  startSeconds?: number;
} | null {
  if (!Array.isArray(assets)) return null;

  for (const asset of assets) {
    if (asset?.type !== "youtube" || typeof asset.url !== "string") continue;
    const info = extractYoutubeVideoInfo(asset.url);
    if (info) {
      return {
        asset,
        videoId: info.videoId,
        startSeconds: info.startSeconds,
      };
    }
  }

  return null;
}

/**
 * Builds an auto-generated YouTube playlist from the first YouTube link of each song in the playlist.
 */
export function buildAutoYoutubePlaylist<
  S extends SongWithYoutubeAssets,
  I extends PlaylistItemLike,
>(items: I[], songMap: Map<string, S>): AutoYoutubePlaylistResult {
  const tracks: AutoYoutubeTrack[] = [];
  const skippedSongTitles: string[] = [];

  for (const item of items) {
    if (item.t) continue;
    const song = songMap.get(item.id);
    if (!song) continue;

    const firstYt = getFirstSongYoutubeAsset(song.meta.assets);
    if (firstYt) {
      tracks.push({
        songId: song.id,
        songTitle: song.meta.title.a,
        assetName: firstYt.asset.name,
        assetUrl: firstYt.asset.url,
        videoId: firstYt.videoId,
        ...(firstYt.startSeconds !== undefined
          ? { startSeconds: firstYt.startSeconds }
          : {}),
      });
    } else {
      skippedSongTitles.push(song.meta.title.a);
    }
  }

  if (tracks.length === 0) {
    return {
      embedUrl: null,
      externalUrl: null,
      tracks,
      skippedSongTitles,
    };
  }

  const first = tracks[0];
  if (tracks.length === 1) {
    const embedQuery = first.startSeconds ? `?start=${first.startSeconds}` : "";
    const externalQuery = first.startSeconds ? `&t=${first.startSeconds}` : "";
    return {
      embedUrl: `https://www.youtube.com/embed/${first.videoId}${embedQuery}`,
      externalUrl: `https://www.youtube.com/watch?v=${first.videoId}${externalQuery}`,
      tracks,
      skippedSongTitles,
    };
  }

  // const restIds = tracks.slice(1).map((t) => t.videoId);
  const restIds = tracks.map((t) => t.videoId);
  const allIds = tracks.map((t) => t.videoId);
  const embedParams = [`playlist=${restIds.join(",")}`];
  if (first.startSeconds) {
    embedParams.push(`start=${first.startSeconds}`);
  }

  return {
    embedUrl: `https://www.youtube.com/embed/${first.videoId}?${embedParams.join("&")}&loop=1`,
    externalUrl: `https://www.youtube.com/watch_videos?video_ids=${allIds.join(",")}`,
    tracks,
    skippedSongTitles,
  };
}

/**
 * Validates and converts a custom YouTube playlist/video link (or iframe embed snippet)
 * into safe embed & external URLs.
 */
export function parseCustomYoutubeUrl(
  rawInput: string,
  depth = 0,
): ParsedYoutubeTarget | null {
  if (depth > 1 || typeof rawInput !== "string") return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Allow pasting full YouTube <iframe> embed snippet by safely extracting src
  if (/^<iframe\b/i.test(trimmed)) {
    const srcMatch = trimmed.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const extractedSrc = (srcMatch?.[1] || srcMatch?.[2] || "").trim();
    if (!extractedSrc) return null;
    return parseCustomYoutubeUrl(extractedSrc, depth + 1);
  }

  // Allow pasting a raw YouTube playlist ID (e.g. PL..., OLAK5uy_..., TLGG...)
  if (RAW_PLAYLIST_ID_REGEX.test(trimmed)) {
    return {
      kind: "playlist",
      listId: trimmed,
      embedUrl: `https://www.youtube.com/embed/videoseries?list=${trimmed}&loop=1`,
      externalUrl: `https://www.youtube.com/playlist?list=${trimmed}`,
    };
  }

  const urlObj = normalizeUrlWithProtocol(trimmed);
  if (!urlObj) return null;

  const segments = urlObj.pathname.split("/").filter(Boolean);

  // 1) Ad-hoc /watch_videos?video_ids=ID1,ID2,...
  if (segments[0] === "watch_videos") {
    const videoIdsParam = urlObj.searchParams.get("video_ids");
    if (!videoIdsParam) return null;
    const ids = videoIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length === 0 || !ids.every(isValidVideoId)) return null;

    if (ids.length === 1) {
      return {
        kind: "video",
        videoIds: ids,
        embedUrl: `https://www.youtube.com/embed/${ids[0]}?playlist=${ids[0]}&loop=1`,
        externalUrl: `https://www.youtube.com/watch?v=${ids[0]}`,
      };
    }

    return {
      kind: "playlist",
      videoIds: ids,
      embedUrl: `https://www.youtube.com/embed/${ids[0]}?playlist=${ids.slice(1).join(",")}&loop=1`,
      externalUrl: `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`,
    };
  }

  const videoId = extractVideoIdFromUrlObj(urlObj);
  const startSeconds = parseYoutubeStartSeconds(
    urlObj.searchParams.get("start") ?? urlObj.searchParams.get("t"),
  );

  // 2) Embed URL with ?playlist=ID1,ID2,...
  const playlistParam = urlObj.searchParams.get("playlist");
  if (playlistParam) {
    const playlistIds = playlistParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (playlistIds.length === 0 || !playlistIds.every(isValidVideoId)) {
      return null;
    }

    const headId = videoId || playlistIds[0];
    const tailIds = videoId
      ? playlistIds[0] === videoId
        ? playlistIds.slice(1)
        : playlistIds
      : playlistIds.slice(1);
    const allIds = [headId, ...tailIds];

    if (allIds.length === 1) {
      const embedQuery = startSeconds ? `?start=${startSeconds}` : "";
      const extQuery = startSeconds ? `&t=${startSeconds}` : "";
      return {
        kind: "video",
        videoIds: allIds,
        startSeconds,
        embedUrl: `https://www.youtube.com/embed/${headId}${embedQuery}&playlist=${headId}&loop=1`,
        externalUrl: `https://www.youtube.com/watch?v=${headId}${extQuery}`,
      };
    }

    const embedParams = [`playlist=${tailIds.join(",")}`];
    if (startSeconds) embedParams.push(`start=${startSeconds}`);

    return {
      kind: "playlist",
      videoIds: allIds,
      startSeconds,
      embedUrl: `https://www.youtube.com/embed/${headId}?${embedParams.join("&")}&loop=1`,
      externalUrl: `https://www.youtube.com/watch_videos?video_ids=${allIds.join(",")}`,
    };
  }

  // 3) Playlist URL (?list=...) — covers /playlist?list=..., /watch?v=...&list=..., /embed/videoseries?list=..., youtu.be/...?list=...
  const listParam = urlObj.searchParams.get("list");
  if (listParam !== null) {
    if (!isValidPlaylistId(listParam)) return null;
    const listId = listParam.trim();

    if (videoId) {
      const embedParams = [`list=${listId}`, `loop=1`];
      const extParams = [`v=${videoId}`, `list=${listId}`];
      if (startSeconds) {
        embedParams.push(`start=${startSeconds}`);
        extParams.push(`t=${startSeconds}`);
      }
      return {
        kind: "playlist",
        listId,
        videoIds: [videoId],
        startSeconds,
        embedUrl: `https://www.youtube.com/embed/${videoId}?${embedParams.join("&")}`,
        externalUrl: `https://www.youtube.com/watch?${extParams.join("&")}`,
      };
    }

    const indexParam = urlObj.searchParams.get("index");
    const parsedIndex =
      indexParam && /^\d+$/.test(indexParam)
        ? Number.parseInt(indexParam, 10)
        : undefined;
    const embedParams = [`list=${listId}`, `loop=1`];
    if (parsedIndex !== undefined && parsedIndex >= 0) {
      embedParams.push(`index=${parsedIndex}`);
    }

    return {
      kind: "playlist",
      listId,
      embedUrl: `https://www.youtube.com/embed/videoseries?${embedParams.join("&")}`,
      externalUrl: `https://www.youtube.com/playlist?list=${listId}`,
    };
  }

  // 4) Single video fallback (watch?v=..., youtu.be/..., shorts/..., live/..., embed/...)
  if (videoId) {
    const embedQuery = startSeconds ? `?start=${startSeconds}` : "";
    const extQuery = startSeconds ? `&t=${startSeconds}` : "";
    return {
      kind: "video",
      videoIds: [videoId],
      startSeconds,
      embedUrl: `https://www.youtube.com/embed/${videoId}${embedQuery}&loop=1`,
      externalUrl: `https://www.youtube.com/watch?v=${videoId}${extQuery}`,
    };
  }

  return null;
}
