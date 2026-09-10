import type { SongData, LineItem } from "@/content.config";

import ProFileProcessor, { generateUUID } from "propresenter-js";
import {
  type ProFormat,
  type Arrangement,
  type Group,
  type Element,
  type UUID,
} from "propresenter-js";

import {
  EXPORT_TEMPLATE_DEFAULT,
  type slideElementOptions,
} from "@/constants/setting";
import { FLOW_NAMES, FLOW_ALIASES } from "@/constants/flow";

export function escapeRtfUnicode(text: string): string {
  let result = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);

    // 1. 特殊字元跳脫
    if (char === "\\") {
      result += "\\\\";
    } else if (char === "{") {
      result += "\\{";
    } else if (char === "}") {
      result += "\\}";
    } else if (char === "\n") {
      result += "\\par\n";
    } else if (char === "\r") {
      // 若為 Windows CRLF，跳過 \r，由接續的 \n 處理
      if (text[i + 1] !== "\n") {
        result += "\\par\n";
      }
    } else if (char === "\t") {
      result += "\\tab ";
    } else if (code >= 32 && code <= 126) {
      // 2. 標準可見 ASCII
      result += char;
    } else {
      // 3. Unicode 字元處理 (含中文與 Emoji Surrogate Pair)
      // RTF 規範規定 N 必須為 16 位元有號整數 (-32768 ~ 32767)
      const signedCode = code > 32767 ? code - 65536 : code;

      // \uc1 表示該 unicode 控制字後跟隨 1 個 ANSI 備援字元（通常放 '?'）
      result += `\\u${signedCode}?`;
    }
  }

  return result;
}

export interface ProOptions {
  // default is all true
  includeCurrentArrangement?: boolean;
  includeDefaultArrangement?: boolean;
  includeTitleSlide?: boolean;
  addBlankSlideBeforeTitle?: boolean;
  addBlankSlideAfterTitle?: boolean;
  addBlankSlideDuringInterlude?: boolean;
  addBlankSlideDuringWorship?: boolean;
  addBlankSlideDuringPrayer?: boolean;
  addBlankSlideAfterEnding?: boolean;
  includeLanguage2?: boolean;
  includeAuthor?: boolean;

  // default is false
  addBlankSlideDuringIntro?: boolean;
  twoLinesPerSlide?: boolean;

  flowMapping?: string; // name of flow mapping, default is "Magical"

  // template for export, if not provided, use default template
  template?: {
    language1?: slideElementOptions;
    language2?: slideElementOptions;
    title1?: slideElementOptions;
    title2?: slideElementOptions;
    title3?: slideElementOptions;
  };
}

export type { ProFormat };

function textToRtf(text: string, format: slideElementOptions): Uint8Array {
  const color = {
    r: format.color ? parseInt(format.color.slice(1, 3), 16) : 255,
    g: format.color ? parseInt(format.color.slice(3, 5), 16) : 255,
    b: format.color ? parseInt(format.color.slice(5, 7), 16) : 255,
  };
  const q = ["\\ql", "\\qc", "\\qr"][format.horizontalAlign ?? 1];
  // {\\rtf1\\ansi\\ansicpg950\\cocoartf2870
  // \\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fnil\\fcharset134 PingFangSC-Regular;\\f1\\fnil\\fcharset0 HelveticaNeue;}
  // {\\colortbl;\\red255\\green255\\blue255;\\red255\\green255\\blue255;}
  // {\\*\\expandedcolortbl;;\\cssrgb\\c100000\\c100000\\c100000;}
  // \\deftab1680
  // \\pard\\pardeftab1680\\pardirnatural\\qc\\partightenfactor0
  //
  // \f0\\fs84 \\cf2 \\CocoaLigature0 \\'c6\\'e6\\'ae\\'90\\'b6\\'f7\\'b5\\'e4
  // \\f1  / Amazing Grace}
  const rtfHeader = `{\\rtf1\\ansi\\ansicpg950\\cocoartf2870
\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fnil\\fcharset136 HelveticaNeue;}
{\\colortbl;\\red255\\green255\\blue255;\\red${color.r}\\green${color.g}\\blue${color.b};}
{\\*\\expandedcolortbl;;\\cssrgb\\c100000\\c100000\\c100000;}
\\deftab1680
\\pard\\pardeftab1680\\pardirnatural${q}\\partightenfactor0

\\f0\\fs${format.fontSize ? format.fontSize * 2 : 96} \\cf2 \\CocoaLigature0 `;
  const rtfFooter = " }";

  // text -> unicode escape -> RTF
  const encodedText = escapeRtfUnicode(text);

  return new TextEncoder().encode(rtfHeader + encodedText + rtfFooter);
}

function getProFormatSlideElements(
  line: LineItem,
  options: ProOptions,
  title3: string | null = null,
): Element[] {
  const options_template_language1 =
    options?.template?.language1 ?? EXPORT_TEMPLATE_DEFAULT.language1;
  const options_template_language2 =
    options?.template?.language2 ?? EXPORT_TEMPLATE_DEFAULT.language2;
  const options_template_title1 =
    options?.template?.title1 ?? EXPORT_TEMPLATE_DEFAULT.title1;
  const options_template_title2 =
    options?.template?.title2 ?? EXPORT_TEMPLATE_DEFAULT.title2;
  const options_template_title3 =
    options?.template?.title3 ?? EXPORT_TEMPLATE_DEFAULT.title3;

  if (!line) return [];
  const elements: Element[] = [];
  if (title3 !== null) {
    elements.push({
      name: "Title1",
      textRtf: textToRtf(line.a || "", options_template_title1),
      align: options_template_title1?.verticalAlign ?? 1,
      bounds: {
        x: options_template_title1?.x ?? 0,
        y: options_template_title1?.y ?? 0,
        width: options_template_title1?.width ?? 1920,
        height: options_template_title1?.height ?? 1080,
      },
    });
    if (options.includeLanguage2 ?? true) {
      elements.push({
        name: "Title2",
        textRtf: textToRtf(line.b || "", options_template_title2),
        align: options_template_title2?.verticalAlign ?? 1,
        bounds: {
          x: options_template_title2?.x ?? 0,
          y: options_template_title2?.y ?? 0,
          width: options_template_title2?.width ?? 1920,
          height: options_template_title2?.height ?? 1080,
        },
      });
    }
    if (options.includeAuthor ?? true) {
      elements.push({
        name: "Title3",
        textRtf: textToRtf(title3, options_template_title3),
        align: options_template_title3?.verticalAlign ?? 1,
        bounds: {
          x: options_template_title3?.x ?? 0,
          y: options_template_title3?.y ?? 0,
          width: options_template_title3?.width ?? 1920,
          height: options_template_title3?.height ?? 1080,
        },
      });
    }
  } else {
    // normal slide, use language1 and language2 template
    elements.push({
      name: "Lang1",
      textRtf: textToRtf(line.a || "", options_template_language1),
      align: options_template_language1?.verticalAlign ?? 1,
      bounds: {
        x: options_template_language1?.x ?? 0,
        y: options_template_language1?.y ?? 0,
        width: options_template_language1?.width ?? 1920,
        height: options_template_language1?.height ?? 1080,
      },
    });
    if (options.includeLanguage2 ?? true) {
      elements.push({
        name: "Lang2",
        textRtf: textToRtf(line.b || "", options_template_language2),
        align: options_template_language2?.verticalAlign ?? 1,
        bounds: {
          x: options_template_language2?.x ?? 0,
          y: options_template_language2?.y ?? 0,
          width: options_template_language2?.width ?? 1920,
          height: options_template_language2?.height ?? 1080,
        },
      });
    }
  }
  return elements;
}

export function getProFormat(
  song: SongData,
  options: ProOptions = {},
  flow?: number[],
): ProFormat {
  // options default values
  const options_includeCurrentArrangement =
    options.includeCurrentArrangement ?? true;
  const options_includeDefaultArrangement =
    options.includeDefaultArrangement ?? true;
  const options_includeTitleSlide = options.includeTitleSlide ?? true;
  const options_addBlankSlideBeforeTitle =
    options.addBlankSlideBeforeTitle ?? true;
  const options_addBlankSlideAfterTitle =
    options.addBlankSlideAfterTitle ?? true;
  const options_addBlankSlideDuringIntro =
    options.addBlankSlideDuringIntro ?? false;
  const options_addBlankSlideDuringInterlude =
    options.addBlankSlideDuringInterlude ?? true;
  const options_addBlankSlideDuringWorship =
    options.addBlankSlideDuringWorship ?? true;
  const options_addBlankSlideDuringPrayer =
    options.addBlankSlideDuringPrayer ?? true;
  const options_addBlankSlideAfterEnding =
    options.addBlankSlideAfterEnding ?? true;
  const options_flowMapping = options.flowMapping ?? "Magical";
  const options_twoLinesPerSlide = options.twoLinesPerSlide ?? false;

  // Implementation for formatting song data into ProPresenter format
  const flowMap = FLOW_NAMES[options_flowMapping] || FLOW_NAMES["Magical"];

  // get all slides from song.sections, and format them into ProFormat slides
  let selectedArrangement: UUID | null = null; // Placeholder for current arrangement logic
  const arrangements: Arrangement[] = [];
  const groupKV = new Map();
  const groups: Group[] = [];
  const slides = [];
  if (options_addBlankSlideBeforeTitle) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
    });
    groupKV.set("blank", generateUUID());
    groups.push({
      uuid: groupKV.get("blank"),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }
  if (options_includeTitleSlide) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: getProFormatSlideElements(
        {
          a: song.meta.title.a,
          b: song.meta.title.b || "",
        },
        options,
        song.meta.author || "",
      ),
    });
    groupKV.set("title", generateUUID());
    groups.push({
      uuid: groupKV.get("title"),
      name: "Title",
      slideUuids: [tempuuid],
    });
  }
  if (options_addBlankSlideAfterTitle) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
    });
    groupKV.set("blank_after_title", generateUUID());
    groups.push({
      uuid: groupKV.get("blank_after_title"),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }

  let currentSectionIndex = 0;
  for (const section of song.sections) {
    const sectionUuid = generateUUID();
    groupKV.set(currentSectionIndex, sectionUuid);
    const slideUuids: string[] = [];
    if (options_twoLinesPerSlide) {
      for (let i = 0; i < section.lines.length; i += 2) {
        const newLine: LineItem = {
          a:
            section.lines[i].a +
            (section.lines[i + 1] ? "\n" + section.lines[i + 1].a : ""),
          b:
            section.lines[i].b +
            (section.lines[i + 1] ? "\n" + section.lines[i + 1].b : ""),
        };
        const slideUuid = generateUUID();
        slideUuids.push(slideUuid);
        slides.push({
          uuid: slideUuid,
          elements: getProFormatSlideElements(newLine, options),
        });
      }
    } else {
      for (const line of section.lines) {
        const slideUuid = generateUUID();
        slideUuids.push(slideUuid);
        slides.push({
          uuid: slideUuid,
          elements: getProFormatSlideElements(line, options),
        });
      }
    }
    const groupName =
      section.name in flowMap
        ? flowMap[section.name as keyof typeof flowMap]
        : section.name in FLOW_ALIASES
          ? flowMap[
              (FLOW_ALIASES[section.name] || "default") as keyof typeof flowMap
            ]
          : section.name;
    groups.push({
      uuid: sectionUuid,
      name: groupName,
      slideUuids: slideUuids as UUID[],
    });
    currentSectionIndex++;
  }

  if (options_addBlankSlideDuringIntro) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
      label: "前奏 Intro",
    });
    groupKV.set(currentSectionIndex, generateUUID());
    groups.push({
      uuid: groupKV.get(currentSectionIndex),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }
  currentSectionIndex++;
  if (options_addBlankSlideDuringInterlude) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
      label: "間奏 Interlude",
    });
    groupKV.set(currentSectionIndex, generateUUID());
    groups.push({
      uuid: groupKV.get(currentSectionIndex),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }
  currentSectionIndex++;
  if (options_addBlankSlideDuringWorship) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
      label: "自由敬拜 Worship",
    });
    groupKV.set(currentSectionIndex, generateUUID());
    groups.push({
      uuid: groupKV.get(currentSectionIndex),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }
  currentSectionIndex++;
  if (options_addBlankSlideDuringPrayer) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
      label: "禱告 Prayer",
    });
    groupKV.set(currentSectionIndex, generateUUID());
    groups.push({
      uuid: groupKV.get(currentSectionIndex),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }

  if (options_addBlankSlideAfterEnding) {
    const tempuuid = generateUUID();
    slides.push({
      uuid: tempuuid,
      elements: [],
    });
    groupKV.set("blank_after_ending", generateUUID());
    groups.push({
      uuid: groupKV.get("blank_after_ending"),
      name: "Blank",
      slideUuids: [tempuuid],
    });
  }

  // set arrangement
  if (options_includeDefaultArrangement && song.meta?.arrangement) {
    const arrangementUuid = generateUUID();
    const arrangementGroupUuids: string[] = [];
    if (options_addBlankSlideBeforeTitle) {
      arrangementGroupUuids.push(groupKV.get("blank"));
    }
    if (options_includeTitleSlide) {
      arrangementGroupUuids.push(groupKV.get("title"));
    }
    if (options_addBlankSlideAfterTitle) {
      arrangementGroupUuids.push(groupKV.get("blank_after_title"));
    }
    for (const arrangementIndex of song.meta.arrangement) {
      const groupUuid = groupKV.get(arrangementIndex);
      if (groupUuid) {
        arrangementGroupUuids.push(groupUuid);
      }
    }
    if (options_addBlankSlideAfterEnding) {
      arrangementGroupUuids.push(groupKV.get("blank_after_ending"));
    }
    arrangements.push({
      uuid: arrangementUuid,
      name: `Default`,
      groupUuids: arrangementGroupUuids as UUID[],
    });
    selectedArrangement = arrangementUuid;
  }
  if (options_includeCurrentArrangement && flow) {
    const arrangementUuid = generateUUID();
    const arrangementGroupUuids: string[] = [];
    if (flow && flow.length > 0) {
      if (options_addBlankSlideBeforeTitle) {
        arrangementGroupUuids.push(groupKV.get("blank"));
      }
      if (options_includeTitleSlide) {
        arrangementGroupUuids.push(groupKV.get("title"));
      }
      if (options_addBlankSlideAfterTitle) {
        arrangementGroupUuids.push(groupKV.get("blank_after_title"));
      }
      for (const flowIndex of flow) {
        const groupUuid = groupKV.get(flowIndex);
        if (groupUuid) {
          arrangementGroupUuids.push(groupUuid);
        }
      }
      if (options_addBlankSlideAfterEnding) {
        arrangementGroupUuids.push(groupKV.get("blank_after_ending"));
      }
    }
    arrangements.push({
      uuid: arrangementUuid,
      name: `Current`,
      groupUuids: arrangementGroupUuids as UUID[],
    });
    selectedArrangement = arrangementUuid;
  }

  return {
    name: song.meta.title.a,
    note: song.meta.note || "",
    selectedArrangement: selectedArrangement || undefined,
    arrangements: arrangements,
    groups: groups,
    slides: slides,
  };
}

export function getProFile(proformat: ProFormat): BlobPart {
  // Implementation for formatting song data into ProPresenter file format
  const processor = new ProFileProcessor();
  processor.setProFormat(proformat);
  const binaryBuffer = processor.getBinaryBuffer();
  if (!binaryBuffer) {
    throw new Error("Failed to generate ProPresenter file.");
  }
  return binaryBuffer as BlobPart;
}
