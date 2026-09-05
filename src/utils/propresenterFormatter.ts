import type { SongData, LineItem } from "@/content/config";

import ProFileProcessor from "propresenter-js";
import {
  type ProFormat,
  type Arrangement,
  type Group,
  type Element,
  type UUID,
} from "propresenter-js";

import { EXPORT_TEMPLATE_DEFAULT } from "@/constants/setting";
import { FLOW_NAMES, FLOW_ALIASES } from "@/constants/flow";

function generateUUID(): UUID {
  return crypto.randomUUID() as UUID;
}

interface slideElementOptions {
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  align?: "center" | "left" | "right";
  justify?: "center" | "left" | "right";
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  hidden?: boolean;
}

export interface ProOptions {
  // default is all true
  includeCurrentArrangement?: boolean;
  includeDefaultArrangement?: boolean;
  includeTitleSlide?: boolean;
  addBlankSlideBeforeTitle?: boolean;
  includeLanguage2?: boolean;
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

function getProFormatSlideElements(
  line: LineItem,
  options: ProOptions,
  title3: string | null = null,
): Element[] {
  if (!line) return [];
  const elements: Element[] = [];
  if (title3 !== null) {
    elements.push({
      name: "Title1",
      textRtf: new TextEncoder().encode(line.a || ""),
    });
    elements.push({
      name: "Title2",
      textRtf: new TextEncoder().encode(line.b || ""),
    });
    elements.push({
      name: "Title3",
      textRtf: new TextEncoder().encode(title3),
    });
  } else {
    // normal slide, use language1 and language2 template
    elements.push({
      name: "Language1",
      textRtf: new TextEncoder().encode(line.a || ""),
    });
    elements.push({
      name: "Language2",
      textRtf: new TextEncoder().encode(line.b || ""),
    });
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
  const options_includeLanguage2 = options.includeLanguage2 ?? true;
  const options_flowMapping = options.flowMapping ?? "Magical";
  const options_template_language1 =
    options.template?.language1 ?? EXPORT_TEMPLATE_DEFAULT.language1;
  const options_template_language2 =
    options.template?.language2 ?? EXPORT_TEMPLATE_DEFAULT.language2;
  const options_template_title1 =
    options.template?.title1 ?? EXPORT_TEMPLATE_DEFAULT.title1;
  const options_template_title2 =
    options.template?.title2 ?? EXPORT_TEMPLATE_DEFAULT.title2;
  const options_template_title3 =
    options.template?.title3 ?? EXPORT_TEMPLATE_DEFAULT.title3;

  // Implementation for formatting song data into ProPresenter format
  const flowMap = FLOW_NAMES[options_flowMapping] || FLOW_NAMES["Magical"];

  // get all slides from song.sections, and format them into ProFormat slides
  let selectedArrangement: Arrangement | null = null; // Placeholder for current arrangement logic
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

  let currentSectionIndex = 0;
  for (const section of song.sections) {
    const sectionUuid = generateUUID();
    groupKV.set(currentSectionIndex, sectionUuid);
    const slideUuids: string[] = [];
    for (const line of section.lines) {
      const slideUuid = generateUUID();
      slideUuids.push(slideUuid);
      slides.push({
        uuid: slideUuid,
        elements: getProFormatSlideElements(line, options),
      });
    }
    const groupName =
      section.type in flowMap
        ? flowMap[section.type as keyof typeof flowMap]
        : section.type in FLOW_ALIASES
          ? flowMap[
              (FLOW_ALIASES[section.type] || "default") as keyof typeof flowMap
            ]
          : section.type;
    groups.push({
      uuid: sectionUuid,
      name: groupName,
      slideUuids: slideUuids as UUID[],
    });
    currentSectionIndex++;
  }

  // set arrangement
  if (
    options_includeDefaultArrangement &&
    song.meta.arrangement &&
    song.meta.arrangement.length > 0
  ) {
    const arrangementUuid = generateUUID();
    const arrangementGroupUuids: string[] = [];
    if (options_addBlankSlideBeforeTitle) {
      arrangementGroupUuids.push(groupKV.get("blank"));
    }
    if (options_includeTitleSlide) {
      arrangementGroupUuids.push(groupKV.get("title"));
    }
    for (const arrangementIndex of song.meta.arrangement) {
      const groupUuid = groupKV.get(arrangementIndex);
      if (groupUuid) {
        arrangementGroupUuids.push(groupUuid);
      }
    }
    arrangements.push({
      uuid: arrangementUuid,
      name: `Default`,
      groupUuids: arrangementGroupUuids as UUID[],
    });
  }
  if (options_includeCurrentArrangement) {
    const arrangementUuid = generateUUID();
    const arrangementGroupUuids: string[] = [];
    if (flow && flow.length > 0) {
      if (options_addBlankSlideBeforeTitle) {
        arrangementGroupUuids.push(groupKV.get("blank"));
      }
      if (options_includeTitleSlide) {
        arrangementGroupUuids.push(groupKV.get("title"));
      }
      for (const flowIndex of flow) {
        const groupUuid = groupKV.get(flowIndex);
        if (groupUuid) {
          arrangementGroupUuids.push(groupUuid);
        }
      }
    }
    arrangements.push({
      uuid: arrangementUuid,
      name: `Current`,
      groupUuids: arrangementGroupUuids as UUID[],
    });
    selectedArrangement = arrangements[arrangements.length - 1];
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
