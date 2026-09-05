export interface FlowMapping {
  $V: string;
  $V1: string;
  $V2: string;
  $V3: string;
  $V4: string;
  $V5: string;
  $V6: string;
  $C: string;
  $C1: string;
  $C2: string;
  $C3: string;
  $C4: string;
  $B: string;
  $B1: string;
  $B2: string;
  $B3: string;
  $PC: string;
  $T: string;
  $I: string;
  $E: string;
  $O: string;
  $Inter: string;
  $Blank: string;
  $Title: string;
  $Prayer: string;
  $Worship: string;
  default: string;
}

export const EX_FLOWS = ["$I", "$Inter", "$Worship", "$Prayer", "$O"] as const;

export const FLOW_STYLE: FlowMapping = {
  $V: "#0077CC",
  $V1: "#0077CC",
  $V2: "#005999",
  $V3: "#003C66",
  $V4: "#0068B3",
  $V5: "#004A80",
  $V6: "#002D4D",
  $C: "#CC004E",
  $C1: "#CC004E",
  $C2: "#99003B",
  $C3: "#660027",
  $C4: "#B30044",
  $B: "#7600CC",
  $B1: "#7600CC",
  $B2: "#590099",
  $B3: "#3B0066",
  $PC: "#CC298B",
  $T: "#CC2929",
  $I: "#B3A724",
  $E: "#998F1F",
  $O: "#7E7619",
  $Inter: "#24B34C",
  $Blank: "#888888",
  $Title: "#888888",
  $Prayer: "#4338CA",
  $Worship: "#4338CA",
  default: "#4338CA",
} as const;

export const FLOW_ALIASES: Record<string, string> = {
  // magical's
  V: "$V",
  V1: "$V1",
  V2: "$V2",
  V3: "$V3",
  V4: "$V4",
  V5: "$V5",
  V6: "$V6",
  C: "$C",
  C1: "$C1",
  C2: "$C2",
  C3: "$C3",
  C4: "$C4",
  B: "$B",
  B1: "$B1",
  B2: "$B2",
  B3: "$B3",
  PC: "$PC",
  T: "$T",
  I: "$I",
  E: "$E",
  O: "$O",
  Inter: "$Inter",
  Blank: "$Blank",
  Title: "$Title",
  // propresenter english
  verse: "$V",
  "verse 1": "$V1",
  "verse 2": "$V2",
  "verse 3": "$V3",
  "verse 4": "$V4",
  "verse 5": "$V5",
  "verse 6": "$V6",
  chorus: "$C",
  "chorus 1": "$C1",
  "chorus 2": "$C2",
  "chorus 3": "$C3",
  "chorus 4": "$C4",
  bridge: "$B",
  "bridge 1": "$B1",
  "bridge 2": "$B2",
  "bridge 3": "$B3",
  "pre-chorus": "$PC",
  tag: "$T",
  intro: "$I",
  ending: "$E",
  outro: "$O",
  interlude: "$Inter",
  blank: "$Blank",
  title: "$Title",
  // propresenter traditional chinese
  主歌: "$V",
  主歌1: "$V1",
  主歌2: "$V2",
  主歌3: "$V3",
  主歌4: "$V4",
  主歌5: "$V5",
  主歌6: "$V6",
  副歌: "$C",
  副歌1: "$C1",
  副歌2: "$C2",
  副歌3: "$C3",
  副歌4: "$C4",
  橋段: "$B",
  橋段1: "$B1",
  橋段2: "$B2",
  橋段3: "$B3",
  導歌: "$PC",
  副歌預熱: "$PC",
  標籤: "$T",
  前奏: "$I",
  結尾: "$E",
  尾奏: "$O",
  間奏: "$Inter",
  空白: "$Blank",
  標題: "$Title",
  // propresenter simplified chinese
  桥段: "$B",
  桥段1: "$B1",
  桥段2: "$B2",
  桥段3: "$B3",
  导歌: "$PC",
  副歌预热: "$PC",
  标签: "$T",
  结尾: "$E",
  间奏: "$Inter",
  标题: "$Title",
} as const;

export const FLOW_NAMES: Record<string, FlowMapping> = {
  Magical: {
    $V: "V",
    $V1: "V1",
    $V2: "V2",
    $V3: "V3",
    $V4: "V4",
    $V5: "V5",
    $V6: "V6",
    $C: "C",
    $C1: "C1",
    $C2: "C2",
    $C3: "C3",
    $C4: "C4",
    $B: "B",
    $B1: "B1",
    $B2: "B2",
    $B3: "B3",
    $PC: "PC",
    $T: "T",
    $I: "I",
    $E: "E",
    $O: "O",
    $Inter: "Inter",
    $Blank: "Blank",
    $Title: "Title",
    $Prayer: "禱告",
    $Worship: "自由敬拜",
    default: "",
  },
  ProPresenter: {
    $V: "Verse",
    $V1: "Verse 1",
    $V2: "Verse 2",
    $V3: "Verse 3",
    $V4: "Verse 4",
    $V5: "Verse 5",
    $V6: "Verse 6",
    $C: "Chorus",
    $C1: "Chorus 1",
    $C2: "Chorus 2",
    $C3: "Chorus 3",
    $C4: "Chorus 4",
    $B: "Bridge",
    $B1: "Bridge 1",
    $B2: "Bridge 2",
    $B3: "Bridge 3",
    $PC: "Pre-Chorus",
    $T: "Tag",
    $I: "Intro",
    $E: "Ending",
    $O: "Outro",
    $Inter: "Interlude",
    $Blank: "Blank",
    $Title: "Title",
    $Prayer: "Prayer",
    $Worship: "Worship",
    default: "",
  },
  繁體中文: {
    $V: "主歌",
    $V1: "主歌1",
    $V2: "主歌2",
    $V3: "主歌3",
    $V4: "主歌4",
    $V5: "主歌5",
    $V6: "主歌6",
    $C: "副歌",
    $C1: "副歌1",
    $C2: "副歌2",
    $C3: "副歌3",
    $C4: "副歌4",
    $B: "橋段",
    $B1: "橋段1",
    $B2: "橋段2",
    $B3: "橋段3",
    $PC: "導歌",
    $T: "標籤",
    $I: "前奏",
    $E: "結尾",
    $O: "尾奏",
    $Inter: "間奏",
    $Blank: "空白",
    $Title: "標題",
    $Prayer: "禱告",
    $Worship: "自由敬拜",
    default: "",
  },
  簡體中文: {
    $V: "主歌",
    $V1: "主歌1",
    $V2: "主歌2",
    $V3: "主歌3",
    $V4: "主歌4",
    $V5: "主歌5",
    $V6: "主歌6",
    $C: "副歌",
    $C1: "副歌1",
    $C2: "副歌2",
    $C3: "副歌3",
    $C4: "副歌4",
    $B: "桥段",
    $B1: "桥段1",
    $B2: "桥段2",
    $B3: "桥段3",
    $PC: "副歌预热",
    $T: "标签",
    $I: "前奏",
    $E: "结尾",
    $O: "尾奏",
    $Inter: "间奏",
    $Blank: "空白",
    $Title: "标题",
    $Prayer: "禱告",
    $Worship: "自由敬拜",
    default: "",
  },
} as const;

export const getFlowName = (
  flow: string,
  nameSet: keyof typeof FLOW_NAMES = "Magical",
): string => {
  return flow in FLOW_NAMES[nameSet]
    ? FLOW_NAMES[nameSet][flow as keyof FlowMapping]
    : flow in FLOW_ALIASES
      ? FLOW_NAMES[nameSet][FLOW_ALIASES[flow] as keyof FlowMapping]
      : flow;
};
