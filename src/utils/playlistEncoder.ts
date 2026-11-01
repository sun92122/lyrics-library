import LZString from "lz-string";
import {
  getFlowTagByIndex,
  getFlowName,
  formatFlowTagName,
} from "@/constants/flow";

export interface PlaylistItem {
  id: string; // 歌曲 ID
  t?: "H" | "D" | "S" | null; // H: header, D: description, S: separator, null: normal song
  k?: string; // 自訂使用調性 (例: "A")
  flow?: number[]; // 段落自訂排程 (1~n: sections[0~n-1]，負數代表雙語反轉，1001~1005: EX_FLOWS, 2000+: customFlow)
  note?: string; // 敬拜備註 (例: "開頭鋼琴引導由弱漸強")
  customFlow?: string[]; // 額外自訂段落排程 (例: ["V1", "C", "V2", "C", "Tag"])
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
    console.error("Failed to decode playlist:", err);
    return null;
  }
}

/**
 * Formats a playlist into a clean messaging outline (e.g. for LINE, Telegram, Discord).
 */
export function formatPlaylistOutline(
  payload: PlaylistPayload,
  songMap: Map<
    string,
    {
      titleA: string;
      titleB?: string;
      originalKey?: string;
      sections?: { name: string }[];
      languages?: { a: string; b?: string };
    }
  >,
): string {
  const lines: string[] = [];
  lines.push(`🎵 ${payload.t || "主日敬拜"}`);
  if (payload.d) {
    lines.push(`📅 ${payload.d}`);
  }
  lines.push("────────────────────────");

  payload.s.forEach((item, index) => {
    if (item.t === "H") {
      lines.push(`\n\n# ${item.note || ""}`);
      return;
    } else if (item.t === "D") {
      lines.push(`> ${item.note?.split("\n").join("\n> ") || ""}`);
      return;
    } else if (item.t === "S") {
      lines.push("\n────────────");
      return;
    }

    const song = songMap.get(item.id);
    const title = song ? song.titleA : item.id;
    const secondaryLanguage = song?.languages?.b?.trim() || "";
    const keyInfo = item.k
      ? `[調性: ${item.k}]`
      : // : song?.originalKey
        //   ? `[原調: ${song.originalKey}]`
        "";

    lines.push(`- ${title} ${keyInfo}`);

    if (item.flow && item.flow.length > 0) {
      const flowStr = item.flow
        .map((tagId) => {
          const rawTag = getFlowTagByIndex(
            tagId,
            song?.sections,
            item.customFlow,
          );
          return rawTag !== "?"
            ? formatFlowTagName(tagId, rawTag, secondaryLanguage)
            : tagId;
        })
        .join(" ➔ ");
      lines.push(`   > 流程：${flowStr}`);
    }

    if (item.note) {
      lines.push(`   > 備註：${item.note}`);
    }
  });

  return lines.join("\n").trim();
}
