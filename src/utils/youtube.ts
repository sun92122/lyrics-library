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
  endSeconds?: number;
}

export interface YoutubeParseResult {
  target: ParsedYoutubeTarget | null;
  error?: string;
}

export interface AutoYoutubeTrack {
  songId: string;
  songTitle: string;
  assetName: string;
  assetUrl: string;
  videoId: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface AutoYoutubePlaylistResult {
  embedUrl: string | null;
  externalUrl: string | null;
  tracks: AutoYoutubeTrack[];
  skippedSongTitles: string[];
}

export interface AnalyzeYoutubeOptions {
  /**
   * When true (e.g. inside a song asset), URLs with both a video ID and `list=`
   * are normalized to the single video (`https://www.youtube.com/watch?v=...`).
   */
  preferSingleVideo?: boolean;
}

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_REGEX = /^[A-Za-z0-9_-]{6,100}$/;
const RAW_PLAYLIST_ID_REGEX =
  /^(PL|UU|LL|FL|OLAK5uy_|RD|TLGG)[A-Za-z0-9_-]{8,90}$/;

function isAllowedYoutubeHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "youtu.be" ||
    h === "youtube.com" ||
    h.endsWith(".youtube.com") ||
    h === "youtube-nocookie.com" ||
    h.endsWith(".youtube-nocookie.com")
  );
}

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

function parseRawTimeSeconds(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  // Colon format: mm:ss or hh:mm:ss
  if (/^\d+(?::\d{1,2}){1,2}$/.test(trimmed)) {
    const parts = trimmed.split(":").map((p) => Number.parseInt(p, 10));
    if (parts.length === 2) {
      const [mins, secs] = parts;
      if (secs >= 60) return null;
      return mins * 60 + secs;
    }
    const [hours, mins, secs] = parts;
    if (mins >= 60 || secs >= 60) return null;
    return hours * 3600 + mins * 60 + secs;
  }

  // Plain integer seconds or `167s`
  if (/^\d+s?$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    return Number.isFinite(secs) ? secs : null;
  }

  // Duration syntax: 1h2m3s, 2m47s, 3m
  const hmsMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const hours = Number.parseInt(hmsMatch[1] || "0", 10);
    const mins = Number.parseInt(hmsMatch[2] || "0", 10);
    const secs = Number.parseInt(hmsMatch[3] || "0", 10);
    const total = hours * 3600 + mins * 60 + secs;
    return Number.isFinite(total) ? total : null;
  }

  return null;
}

/**
 * Parses YouTube time parameters (`t`, `start`, or `end`), supporting integer seconds,
 * `167s`, `1h2m3s`, `mm:ss`, or `hh:mm:ss`. Returns positive integer seconds or undefined.
 */
export function parseYoutubeTimeSeconds(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined;
  const parsed = parseRawTimeSeconds(value);
  return parsed !== null && parsed > 0 ? parsed : undefined;
}

/**
 * Backwards-compatible alias for `parseYoutubeTimeSeconds`.
 */
export const parseYoutubeStartSeconds = parseYoutubeTimeSeconds;

/**
 * Formats seconds cleanly as `m:ss` or `h:mm:ss` for display hints.
 */
export function formatSecondsDisplay(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Validates a user-entered start/end time field string (`90`, `90s`, `1:30`, `1m30s`).
 */
export function parseYoutubeTimeInput(
  raw: string,
  options: { allowZeroAsUnset?: boolean } = {},
): { seconds?: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  const parsed = parseRawTimeSeconds(trimmed);
  if (parsed === null) {
    return {
      error: "時間格式無效，請輸入秒數（如 90）或 分:秒（如 1:30）",
    };
  }
  if (parsed === 0) {
    if (options.allowZeroAsUnset) {
      return {};
    }
    return { error: "結束時間必須大於 0 秒" };
  }
  if (parsed < 0) {
    return { error: "時間必須為大於 0 的數字" };
  }
  return { seconds: parsed };
}

function buildQuery(
  entries: Array<[string, string | number | undefined]>,
): string {
  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

type NormalizeUrlOutcome =
  { ok: true; urlObj: URL } | { ok: false; error: string };

function inspectYoutubeUrl(raw: string): NormalizeUrlOutcome {
  const trimmed = raw.trim();
  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const withProtocol = hasExplicitScheme ? trimmed : `https://${trimmed}`;

  try {
    const urlObj = new URL(withProtocol);
    if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
      return { ok: false, error: "不支援的連結協定，請使用 YouTube 網址" };
    }
    const host = urlObj.hostname.toLowerCase();
    if (!isAllowedYoutubeHost(host)) {
      return {
        ok: false,
        error: "連結必須為 YouTube 網址（支援 youtube.com、youtu.be）",
      };
    }
    return { ok: true, urlObj };
  } catch {
    return {
      ok: false,
      error: "YouTube 連結格式無效，請確認網址是否完整",
    };
  }
}

function normalizeUrlWithProtocol(raw: string): URL | null {
  const outcome = inspectYoutubeUrl(raw);
  return outcome.ok ? outcome.urlObj : null;
}

function resolveAttributionUrl(urlObj: URL): URL {
  if (urlObj.pathname === "/attribution_link") {
    const u = urlObj.searchParams.get("u");
    if (u) {
      try {
        return new URL(u, "https://www.youtube.com");
      } catch {
        // fall through to original urlObj
      }
    }
  }
  return urlObj;
}

function extractVideoIdFromUrlObj(urlObj: URL): string | null {
  const host = urlObj.hostname.toLowerCase();
  const segments = urlObj.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const candidate = segments[0];
    return isValidVideoId(candidate) ? candidate : null;
  }

  if (host === "studio.youtube.com" && segments[0] === "video") {
    const candidate = segments[1];
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
      segments[0] === "v" ||
      segments[0] === "e")
  ) {
    const candidate = segments[1];
    return isValidVideoId(candidate) ? candidate : null;
  }

  return null;
}

function getHashSearchParams(urlObj: URL): URLSearchParams {
  const rawHash = urlObj.hash.replace(/^#/, "").trim();
  if (!rawHash) return new URLSearchParams();
  if (rawHash.includes("=")) {
    return new URLSearchParams(rawHash);
  }
  return new URLSearchParams();
}

function inspectUrlTimeParams(urlObj: URL): {
  startSeconds?: number;
  endSeconds?: number;
  error?: string;
} {
  const hashParams = getHashSearchParams(urlObj);

  const rawStart = [
    urlObj.searchParams.get("start"),
    urlObj.searchParams.get("t"),
    urlObj.searchParams.get("time_continue"),
    hashParams.get("t"),
    hashParams.get("start"),
  ].find((v): v is string => v !== null && v.trim() !== "");

  let startSeconds: number | undefined;
  if (rawStart !== undefined) {
    const parsedStart = parseRawTimeSeconds(rawStart);
    if (parsedStart === null) {
      return {
        error:
          "網址中的開始時間參數格式無效，請使用整數秒數（如 90）或 分:秒（如 1:30）",
      };
    }
    if (parsedStart > 0) {
      startSeconds = parsedStart;
    }
  }

  const rawEnd = [urlObj.searchParams.get("end"), hashParams.get("end")].find(
    (v): v is string => v !== null && v.trim() !== "",
  );

  let endSeconds: number | undefined;
  if (rawEnd !== undefined) {
    const parsedEnd = parseRawTimeSeconds(rawEnd);
    if (parsedEnd === null) {
      return {
        error:
          "網址中的結束時間參數格式無效，請使用整數秒數（如 180）或 分:秒（如 3:00）",
      };
    }
    if (parsedEnd <= 0) {
      return {
        error: "網址中的結束時間必須大於 0 秒",
      };
    }
    endSeconds = parsedEnd;
  }

  if (
    startSeconds !== undefined &&
    endSeconds !== undefined &&
    endSeconds <= startSeconds
  ) {
    return {
      error: `結束時間（${endSeconds} 秒）必須大於開始時間（${startSeconds} 秒）`,
    };
  }

  return {
    ...(startSeconds !== undefined ? { startSeconds } : {}),
    ...(endSeconds !== undefined ? { endSeconds } : {}),
  };
}

/**
 * Extracts `startSeconds` (`start`, `t`, `time_continue`, or `#t=`) and `endSeconds` (`end`) from any URL string safely.
 */
export function extractYoutubeTimeFields(rawUrl: string): {
  startSeconds?: number;
  endSeconds?: number;
} {
  const initialUrlObj = normalizeUrlWithProtocol(rawUrl);
  if (!initialUrlObj) return {};

  const urlObj = resolveAttributionUrl(initialUrlObj);
  const hashParams = getHashSearchParams(urlObj);

  const startSeconds =
    parseYoutubeTimeSeconds(urlObj.searchParams.get("start")) ??
    parseYoutubeTimeSeconds(urlObj.searchParams.get("t")) ??
    parseYoutubeTimeSeconds(urlObj.searchParams.get("time_continue")) ??
    parseYoutubeTimeSeconds(hashParams.get("t")) ??
    parseYoutubeTimeSeconds(hashParams.get("start"));
  const endSeconds =
    parseYoutubeTimeSeconds(urlObj.searchParams.get("end")) ??
    parseYoutubeTimeSeconds(hashParams.get("end"));

  return {
    ...(startSeconds !== undefined ? { startSeconds } : {}),
    ...(endSeconds !== undefined ? { endSeconds } : {}),
  };
}

/**
 * Extracts YouTube video ID and optional start/end timestamps from a video URL.
 */
export function extractYoutubeVideoInfo(
  rawUrl: string,
): { videoId: string; startSeconds?: number; endSeconds?: number } | null {
  const initialUrlObj = normalizeUrlWithProtocol(rawUrl);
  if (!initialUrlObj) return null;

  const urlObj = resolveAttributionUrl(initialUrlObj);
  const videoId = extractVideoIdFromUrlObj(urlObj);
  if (!videoId) return null;

  const hashParams = getHashSearchParams(urlObj);
  const startSeconds =
    parseYoutubeTimeSeconds(urlObj.searchParams.get("start")) ??
    parseYoutubeTimeSeconds(urlObj.searchParams.get("t")) ??
    parseYoutubeTimeSeconds(urlObj.searchParams.get("time_continue")) ??
    parseYoutubeTimeSeconds(hashParams.get("t")) ??
    parseYoutubeTimeSeconds(hashParams.get("start"));
  const rawEndSeconds =
    parseYoutubeTimeSeconds(urlObj.searchParams.get("end")) ??
    parseYoutubeTimeSeconds(hashParams.get("end"));
  const endSeconds =
    rawEndSeconds !== undefined &&
    (startSeconds === undefined || rawEndSeconds > startSeconds)
      ? rawEndSeconds
      : undefined;

  return {
    videoId,
    ...(startSeconds !== undefined ? { startSeconds } : {}),
    ...(endSeconds !== undefined ? { endSeconds } : {}),
  };
}

/**
 * Returns the first YouTube asset of a song that yields a valid YouTube video ID.
 */
export function getFirstSongYoutubeAsset(assets?: YoutubeAssetLike[]): {
  asset: YoutubeAssetLike;
  videoId: string;
  startSeconds?: number;
  endSeconds?: number;
} | null {
  if (!Array.isArray(assets)) return null;

  for (const asset of assets) {
    if (asset?.type !== "youtube" || typeof asset.url !== "string") continue;
    const info = extractYoutubeVideoInfo(asset.url);
    if (info) {
      return {
        asset,
        videoId: info.videoId,
        ...(info.startSeconds !== undefined
          ? { startSeconds: info.startSeconds }
          : {}),
        ...(info.endSeconds !== undefined
          ? { endSeconds: info.endSeconds }
          : {}),
      };
    }
  }

  return null;
}

/**
 * Builds an auto-generated YouTube playlist from the first YouTube link of each song in the playlist.
 * All embedded URLs include `loop=1` (with `playlist=VIDEO_ID` for single videos per YouTube docs).
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
        ...(firstYt.endSeconds !== undefined
          ? { endSeconds: firstYt.endSeconds }
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
    const embedQuery = buildQuery([
      ["playlist", first.videoId],
      ["loop", 1],
      ["start", first.startSeconds],
      ["end", first.endSeconds],
    ]);
    const externalQuery = buildQuery([
      ["v", first.videoId],
      ["t", first.startSeconds],
      ["end", first.endSeconds],
    ]);
    return {
      embedUrl: `https://www.youtube.com/embed/${first.videoId}${embedQuery}`,
      externalUrl: `https://www.youtube.com/watch${externalQuery}`,
      tracks,
      skippedSongTitles,
    };
  }

  const allIds = tracks.map((t) => t.videoId);
  const embedQuery = buildQuery([
    ["playlist", allIds.join(",")],
    ["loop", 1],
    ["start", first.startSeconds],
    ["end", first.endSeconds],
  ]);

  return {
    embedUrl: `https://www.youtube.com/embed/${first.videoId}${embedQuery}`,
    externalUrl: `https://www.youtube.com/watch_videos?video_ids=${allIds.join(",")}`,
    tracks,
    skippedSongTitles,
  };
}

/**
 * Analyzes and validates a YouTube playlist/video link (or `<iframe>` embed snippet),
 * returning both a safe parsed target (with `loop=1`, `start`, and `end`) and descriptive error messages.
 */
export function analyzeYoutubeUrl(
  rawInput: string,
  options: AnalyzeYoutubeOptions = {},
  depth = 0,
): YoutubeParseResult {
  if (depth > 2 || typeof rawInput !== "string") {
    return { target: null, error: "YouTube 連結格式無效" };
  }
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { target: null };
  }

  // Allow pasting full YouTube <iframe> embed snippet by safely extracting src
  if (/^<iframe\b/i.test(trimmed)) {
    const srcMatch = trimmed.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const extractedSrc = (srcMatch?.[1] || srcMatch?.[2] || "").trim();
    if (!extractedSrc) {
      return {
        target: null,
        error: "無法從嵌入碼中找到有效的 YouTube src 連結",
      };
    }
    return analyzeYoutubeUrl(extractedSrc, options, depth + 1);
  }

  // Allow pasting a raw YouTube playlist ID (e.g. PL..., OLAK5uy_..., TLGG...)
  if (RAW_PLAYLIST_ID_REGEX.test(trimmed)) {
    return {
      target: {
        kind: "playlist",
        listId: trimmed,
        embedUrl: `https://www.youtube.com/embed/videoseries?list=${trimmed}&loop=1`,
        externalUrl: `https://www.youtube.com/playlist?list=${trimmed}`,
      },
    };
  }

  const outcome = inspectYoutubeUrl(trimmed);
  if (!outcome.ok) {
    return { target: null, error: outcome.error };
  }

  const urlObj = resolveAttributionUrl(outcome.urlObj);
  if (!isAllowedYoutubeHost(urlObj.hostname)) {
    return {
      target: null,
      error: "連結必須為 YouTube 網址（支援 youtube.com、youtu.be）",
    };
  }

  const segments = urlObj.pathname.split("/").filter(Boolean);
  const inspectedTime = inspectUrlTimeParams(urlObj);
  if (inspectedTime.error) {
    return { target: null, error: inspectedTime.error };
  }

  const { startSeconds, endSeconds } = inspectedTime;

  const timeFields = {
    ...(startSeconds !== undefined ? { startSeconds } : {}),
    ...(endSeconds !== undefined ? { endSeconds } : {}),
  };

  // 1) Ad-hoc /watch_videos?video_ids=ID1,ID2,...
  if (segments[0] === "watch_videos") {
    const videoIdsParam = urlObj.searchParams.get("video_ids");
    if (!videoIdsParam) {
      return { target: null, error: "watch_videos 連結缺少 video_ids 參數" };
    }
    const ids = videoIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length === 0 || !ids.every(isValidVideoId)) {
      return {
        target: null,
        error: "watch_videos 連結包含無效的 YouTube 影片 ID",
      };
    }

    if (ids.length === 1) {
      return {
        target: {
          kind: "video",
          videoIds: ids,
          ...timeFields,
          embedUrl: `https://www.youtube.com/embed/${ids[0]}${buildQuery([
            ["playlist", ids[0]],
            ["loop", 1],
            ["start", startSeconds],
            ["end", endSeconds],
          ])}`,
          externalUrl: `https://www.youtube.com/watch${buildQuery([
            ["v", ids[0]],
            ["t", startSeconds],
            ["end", endSeconds],
          ])}`,
        },
      };
    }

    return {
      target: {
        kind: "playlist",
        videoIds: ids,
        ...timeFields,
        embedUrl: `https://www.youtube.com/embed/${ids[0]}${buildQuery([
          ["playlist", ids.join(",")],
          ["loop", 1],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
        externalUrl: `https://www.youtube.com/watch_videos${buildQuery([
          ["video_ids", ids.join(",")],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
      },
    };
  }

  const videoId = extractVideoIdFromUrlObj(urlObj);

  // 2) Embed URL with ?playlist=ID1,ID2,...
  const playlistParam = urlObj.searchParams.get("playlist");
  if (playlistParam) {
    const playlistIds = playlistParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (playlistIds.length === 0 || !playlistIds.every(isValidVideoId)) {
      return {
        target: null,
        error: "playlist 參數包含無效的 YouTube 影片 ID",
      };
    }

    const headId = videoId || playlistIds[0];
    const tailIds = videoId
      ? playlistIds[0] === videoId
        ? playlistIds.slice(1)
        : playlistIds
      : playlistIds.slice(1);
    const allIds = [headId, ...tailIds];

    if (allIds.length === 1) {
      return {
        target: {
          kind: "video",
          videoIds: allIds,
          ...timeFields,
          embedUrl: `https://www.youtube.com/embed/${headId}${buildQuery([
            ["playlist", headId],
            ["loop", 1],
            ["start", startSeconds],
            ["end", endSeconds],
          ])}`,
          externalUrl: `https://www.youtube.com/watch${buildQuery([
            ["v", headId],
            ["t", startSeconds],
            ["end", endSeconds],
          ])}`,
        },
      };
    }

    return {
      target: {
        kind: "playlist",
        videoIds: allIds,
        ...timeFields,
        embedUrl: `https://www.youtube.com/embed/${headId}${buildQuery([
          ["playlist", allIds.join(",")],
          ["loop", 1],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
        externalUrl: `https://www.youtube.com/watch_videos${buildQuery([
          ["video_ids", allIds.join(",")],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
      },
    };
  }

  // 3) Playlist URL (?list=...) — covers /playlist?list=..., /watch?v=...&list=..., /embed/videoseries?list=..., youtu.be/...?list=...
  const listParam = urlObj.searchParams.get("list");
  if (listParam !== null && !(options.preferSingleVideo && videoId)) {
    if (!isValidPlaylistId(listParam)) {
      return { target: null, error: "無效的 YouTube 播放清單 ID" };
    }
    const listId = listParam.trim();

    if (videoId) {
      return {
        target: {
          kind: "playlist",
          listId,
          videoIds: [videoId],
          ...timeFields,
          embedUrl: `https://www.youtube.com/embed/${videoId}${buildQuery([
            ["list", listId],
            ["loop", 1],
            ["start", startSeconds],
            ["end", endSeconds],
          ])}`,
          externalUrl: `https://www.youtube.com/watch${buildQuery([
            ["v", videoId],
            ["list", listId],
            ["t", startSeconds],
            ["end", endSeconds],
          ])}`,
        },
      };
    }

    const indexParam = urlObj.searchParams.get("index");
    const parsedIndex =
      indexParam && /^\d+$/.test(indexParam)
        ? Number.parseInt(indexParam, 10)
        : undefined;

    return {
      target: {
        kind: "playlist",
        listId,
        ...timeFields,
        embedUrl: `https://www.youtube.com/embed/videoseries${buildQuery([
          ["list", listId],
          ["loop", 1],
          [
            "index",
            parsedIndex !== undefined && parsedIndex >= 0
              ? parsedIndex
              : undefined,
          ],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
        externalUrl: `https://www.youtube.com/playlist${buildQuery([
          ["list", listId],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
      },
    };
  }

  // 4) Single video fallback (watch?v=..., youtu.be/..., shorts/..., live/..., embed/...)
  if (videoId) {
    return {
      target: {
        kind: "video",
        videoIds: [videoId],
        ...timeFields,
        embedUrl: `https://www.youtube.com/embed/${videoId}${buildQuery([
          ["playlist", videoId],
          ["loop", 1],
          ["start", startSeconds],
          ["end", endSeconds],
        ])}`,
        externalUrl: `https://www.youtube.com/watch${buildQuery([
          ["v", videoId],
          ["t", startSeconds],
          ["end", endSeconds],
        ])}`,
      },
    };
  }

  return {
    target: null,
    error: "找不到有效的 YouTube 影片或播放清單 ID，請確認網址是否完整",
  };
}

/**
 * Validates and converts a custom YouTube playlist/video link (or iframe embed snippet)
 * into safe embed (with `loop=1`, `start`, `end`) & external URLs.
 */
export function parseCustomYoutubeUrl(
  rawInput: string,
): ParsedYoutubeTarget | null {
  return analyzeYoutubeUrl(rawInput).target;
}

/**
 * Rewrites start (`t`/`start`) and `end` parameters on a YouTube URL while keeping
 * its video/playlist identity intact. Returns `{ nextUrl, error }`.
 */
export function updateYoutubeUrlTimeParams(
  rawUrl: string,
  startSeconds?: number,
  endSeconds?: number,
  options: AnalyzeYoutubeOptions = {},
): { nextUrl?: string; error?: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { error: "請先輸入 YouTube 連結" };
  }

  // Normalize without existing time params first so base validity checks don't fail on prior end<=start
  let baseUrlString = trimmed;
  if (/^<iframe\b/i.test(trimmed)) {
    const srcMatch = trimmed.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!srcMatch?.[1] && !srcMatch?.[2]) {
      return { error: "無法從嵌入碼中找到有效的 YouTube 連結" };
    }
    baseUrlString = (srcMatch[1] || srcMatch[2] || "").trim();
  } else if (RAW_PLAYLIST_ID_REGEX.test(trimmed)) {
    baseUrlString = `https://www.youtube.com/playlist?list=${trimmed}`;
  }

  const outcome = inspectYoutubeUrl(baseUrlString);
  if (!outcome.ok) {
    return { error: outcome.error };
  }

  const urlObj = resolveAttributionUrl(outcome.urlObj);
  urlObj.searchParams.delete("t");
  urlObj.searchParams.delete("start");
  urlObj.searchParams.delete("time_continue");
  urlObj.searchParams.delete("end");
  urlObj.hash = "";

  const strippedAnalysis = analyzeYoutubeUrl(urlObj.toString(), options);
  if (!strippedAnalysis.target) {
    return { error: strippedAnalysis.error || "YouTube 連結無效" };
  }

  const canonical = new URL(strippedAnalysis.target.externalUrl);
  canonical.searchParams.delete("t");
  canonical.searchParams.delete("start");
  canonical.searchParams.delete("end");

  if (startSeconds !== undefined && startSeconds > 0) {
    if (canonical.pathname === "/watch") {
      canonical.searchParams.set("t", String(startSeconds));
    } else {
      canonical.searchParams.set("start", String(startSeconds));
    }
  }
  if (endSeconds !== undefined && endSeconds > 0) {
    canonical.searchParams.set("end", String(endSeconds));
  }

  const nextUrl = canonical.toString();
  if (
    startSeconds !== undefined &&
    endSeconds !== undefined &&
    endSeconds <= startSeconds
  ) {
    return {
      nextUrl,
      error: `結束時間（${endSeconds} 秒）必須大於開始時間（${startSeconds} 秒）`,
    };
  }

  return { nextUrl };
}
