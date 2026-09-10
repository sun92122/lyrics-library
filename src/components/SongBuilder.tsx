import React, { useState, useEffect } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  FLOW_STYLE,
  FLOW_ALIASES,
  EX_FLOWS,
  getFlowName,
  type FlowMapping,
} from "@/constants/flow";
import type { SongData, SectionItem } from "@/content.config";
import {
  Fieldset,
  Input,
  Label,
  Legend,
  Select,
  Textarea,
  Button,
  Field,
  Switch,
} from "@headlessui/react";
import { Sparkles } from "lucide-react";
import { LyricsViewer } from "@/components/LyricsViewer";

function matchFlowAlias(line: string): {
  isValid: boolean;
  sectionName: string;
} {
  const trimmed = line.trim();
  if (!trimmed) return { isValid: false, sectionName: "" };

  const candidates: string[] = [];

  // [段落名]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    candidates.push(trimmed.slice(1, -1).trim());
  }
  // # 段落名
  if (trimmed.startsWith("#")) {
    candidates.push(trimmed.replace(/^#+\s*/, "").trim());
  }
  // 段落名
  candidates.push(trimmed.replace(/:$/, "").trim());

  for (const cand of candidates) {
    if (!cand) continue;

    const candLower = cand.toLowerCase();
    const candNoSpace = candLower.replace(/\s+/g, "");

    const resolved =
      FLOW_ALIASES[cand] ||
      FLOW_ALIASES[candLower] ||
      FLOW_ALIASES[candNoSpace];

    // 核心條件：開頭為 '$' 即為合法段落
    if (typeof resolved === "string" && resolved.startsWith("$")) {
      return { isValid: true, sectionName: resolved };
    }
  }

  return { isValid: false, sectionName: "" };
}

function parseLineWithChords(raw: string): {
  text: string;
  chords: { index: number; chord: string }[];
} {
  let text = "";
  const chords: { index: number; chord: string }[] = [];
  let cursor = 0;
  let charCount = 0;

  while (cursor < raw.length) {
    if (raw[cursor] === "[") {
      const closeIdx = raw.indexOf("]", cursor);
      if (closeIdx !== -1) {
        const chord = raw.slice(cursor + 1, closeIdx).trim();
        if (chord) {
          chords.push({ index: charCount, chord });
        }
        cursor = closeIdx + 1;
        continue;
      }
    }
    text += raw[cursor];
    charCount++;
    cursor++;
  }

  return { text, chords };
}

function parseLyricsText(
  text: string,
  isBilingual: boolean,
): {
  name: string;
  lines: {
    a: string;
    b?: string;
    chords?: { index: number; chord: string }[];
  }[];
}[] {
  const rawLines = text.split("\n").map((l) => l.trimEnd());
  const sections: {
    name: string;
    lines: {
      a: string;
      b?: string;
      chords?: { index: number; chord: string }[];
    }[];
  }[] = [];
  let currentSection: {
    name: string;
    lines: {
      a: string;
      b?: string;
      chords?: { index: number; chord: string }[];
    }[];
  } | null = null;

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    const sectionMatch = matchFlowAlias(line);
    if (sectionMatch.isValid) {
      if (currentSection && currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        name: sectionMatch.sectionName,
        lines: [],
      };
      i++;
      continue;
    }

    if (!currentSection) {
      currentSection = { name: "Verse 1", lines: [] };
    }

    if (isBilingual) {
      const parsedA = parseLineWithChords(line);
      let lineB = "";

      if (i + 1 < rawLines.length) {
        const nextTrimmed = rawLines[i + 1].trim();
        if (nextTrimmed && !matchFlowAlias(nextTrimmed).isValid) {
          lineB = nextTrimmed;
          i++;
        }
      }

      currentSection.lines.push({
        a: parsedA.text,
        ...(lineB ? { b: lineB.replaceAll("\\n", "\n") } : {}),
        ...(parsedA.chords.length > 0 ? { chords: parsedA.chords } : {}),
      });
    } else {
      const parsedA = parseLineWithChords(line);
      currentSection.lines.push({
        a: parsedA.text,
        ...(parsedA.chords.length > 0 ? { chords: parsedA.chords } : {}),
      });
    }
    i++;
  }

  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

export const SongBuilder: React.FC = () => {
  const [isBilingual, setIsBilingual] = useState(true);
  const [id, setId] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SongData["meta"]>({
    languages: { a: "中文", b: "" },
    title: { a: "", b: "" },
    tags: [],
    arrangement: [],
    assets: [{ type: "youtube", name: "YouTube", url: "" }],
  });
  const [tagsInput, setTagsInput] = useState<string>("");
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [rawLyrics, setRawLyrics] = useState("");

  useEffect(() => {
    const parsedSections = parseLyricsText(rawLyrics, isBilingual);
    setSections(parsedSections);
    if (parsedSections.some((sec) => sec.lines.some((line) => line.b))) {
      setMeta((prev) => ({
        ...prev,
        languages: { ...prev.languages, b: prev.languages.b || "English" },
      }));
    }
  }, [rawLyrics, isBilingual]);
  useEffect(() => {
    setMeta((prev) => ({
      ...prev,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
    }));
  }, [tagsInput]);

  const handleDownloadJson = () => {
    const songData: SongData = {
      meta,
      sections,
    };
    songData.meta.assets = songData.meta.assets?.filter(
      (asset) => asset.name && asset.url,
    );
    if (!songData.meta.title.a || !songData.meta.languages.a) {
      setIdError("請設定歌曲主要名稱和語言");
      return;
    }
    const currentId =
      id ||
      (meta.title.b && meta.title.b.replace(/[\s,]+/g, "-").toLowerCase());
    if (!id) {
      setId(currentId || "");
    }
    if (!currentId) {
      setIdError("請設定 ID 或英文歌曲名稱");
      return;
    } else {
      setIdError(null);
    }
    const jsonStr = JSON.stringify(songData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentId + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadComponent = (
    <>
      <div className="flex px-6 items-baseline">
        <Input
          value={id}
          onChange={(e) => {
            setId(e.target.value.replace(/[\s,]+/g, "-").toLowerCase());
            setIdError(null);
          }}
          placeholder={
            meta.title.b
              ? meta.title.b.replace(/[\s,]+/g, "-").toLowerCase()
              : "song-id"
          }
          className="text-right w-[50%] rounded-lg p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        .json
        <Button
          type="button"
          onClick={handleDownloadJson}
          className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          下載 JSON
        </Button>
      </div>
      {idError && (
        <div className="flex w-full justify-center text-sm text-red-500 !m-0">
          {idError}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Song Builder</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            產生歌曲 JSON
          </h1>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {/* <Layers className="w-5 h-5 text-indigo-600" /> */}
              <span>導入歌詞資料</span>
            </h2>
            <Field className="flex items-center gap-3">
              <Label>雙語模式</Label>
              <Switch
                checked={isBilingual}
                onChange={setIsBilingual}
                className={`${
                  isBilingual ? "bg-blue-600" : "bg-gray-200"
                } relative inline-flex h-6 w-11 items-center rounded-full`}
              >
                <span
                  className={`${
                    isBilingual ? "translate-x-6" : "translate-x-1"
                  } inline-block h-4 w-4 transform rounded-full bg-white transition`}
                />
              </Switch>
            </Field>
          </div>
          <span className="text-sm text-slate-500">歌曲資訊</span>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                歌曲名稱*
              </Label>
              <Input
                value={meta.title.a}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    title: { ...prev.title, a: e.target.value },
                  }))
                }
                placeholder="奇異恩典"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                歌曲名稱 (次要語言/英文)
              </Label>
              <Input
                value={meta.title.b}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    title: { ...prev.title, b: e.target.value },
                  }))
                }
                placeholder="Amazing Grace"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                主要語言*
              </Label>
              <Input
                value={meta.languages.a}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    languages: { ...prev.languages, a: e.target.value },
                  }))
                }
                placeholder="中文"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                次要語言
              </Label>
              <Input
                value={meta.languages.b}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    languages: { ...prev.languages, b: e.target.value },
                  }))
                }
                placeholder="English"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>
          <Field className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              創作者 / 樂團 (Author / Artist)
            </Label>
            <Textarea
              value={meta.author}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, author: e.target.value }))
              }
              placeholder="作詞：John Newton"
              rows={3}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </Field>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                原調 (Original Key)
              </Label>
              <Input
                value={meta.originalKey}
                onChange={(e) =>
                  setMeta((prev) => ({ ...prev, originalKey: e.target.value }))
                }
                placeholder="G, F#m"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">BPM</Label>
              <Input
                type="number"
                value={meta.bpm || ""}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    bpm: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  }))
                }
                placeholder="72"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>
          <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">
                標籤 (Tags)
              </Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="敬拜, 恩典, 經典, 約書亞樂團, Hillsong"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700">CCLI</Label>
              <Input
                value={meta.ccli || ""}
                onChange={(e) =>
                  setMeta((prev) => ({
                    ...prev,
                    ccli: e.target.value ? e.target.value.trim() : undefined,
                  }))
                }
                placeholder="2762836"
                type="number"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </Field>

          <Field className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              原始歌詞
            </Label>
            <Textarea
              value={rawLyrics}
              onChange={(e) => setRawLyrics(e.target.value)}
              placeholder="在此輸入原始歌詞，支援段落標記 [Verse 1]、[Chorus] 等"
              rows={10}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </Field>

          <Field className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              歌曲備註
            </Label>
            <Textarea
              value={meta.note}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="在此輸入歌曲備註"
              rows={1}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </Field>

          <div>
            <span className="block text-sm text-slate-500">附加資源</span>
            {meta.assets &&
              meta.assets.length > 0 &&
              meta.assets.map((asset, index) => (
                <div key={index}>
                  <div className="flex flex-col gap-2 mt-2 border-collapse border border-slate-200 rounded-lg p-4">
                    <div className="w-full flex text-sm font-medium text-slate-700">
                      <span>資源 {index + 1}</span>
                      <Button
                        type="button"
                        onClick={() =>
                          setMeta((prev) => {
                            const newAssets = [...(prev.assets || [])];
                            newAssets.splice(index, 1);
                            return { ...prev, assets: newAssets };
                          })
                        }
                        className="ml-auto px-2 py-0.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                      >
                        刪除
                      </Button>
                    </div>
                    <Field className="grid grid-cols-2 gap-4">
                      <Field className="flex flex-col gap-2">
                        <Label className="text-sm font-medium text-slate-700">
                          名稱
                        </Label>
                        <Input
                          value={asset.name}
                          onChange={(e) =>
                            setMeta((prev) => {
                              const newAssets = [...(prev.assets || [])];
                              newAssets[index] = {
                                ...newAssets[index],
                                name: e.target.value,
                              };
                              return { ...prev, assets: newAssets };
                            })
                          }
                          placeholder="YouTube"
                          className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </Field>
                      <Field className="flex flex-col gap-2">
                        <Label className="text-sm font-medium text-slate-700">
                          類型
                        </Label>
                        <Select
                          value={asset.type}
                          onChange={(e) =>
                            setMeta((prev) => {
                              const newAssets = [...(prev.assets || [])];
                              newAssets[index] = {
                                ...newAssets[index],
                                type: e.target.value as any,
                              };
                              return { ...prev, assets: newAssets };
                            })
                          }
                          className="w-full !rounded-lg border border-slate-300 h-[46px] text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 *:block"
                        >
                          <option value="youtube">YouTube</option>
                          <option value="other">其他連結</option>
                        </Select>
                      </Field>
                    </Field>
                    <Field>
                      <Input
                        value={asset.url}
                        onChange={(e) =>
                          setMeta((prev) => {
                            const newAssets = [...(prev.assets || [])];
                            newAssets[index] = {
                              ...newAssets[index],
                              url: e.target.value,
                            };
                            return { ...prev, assets: newAssets };
                          })
                        }
                        placeholder="https://www.youtube.com/watch?v=example"
                        className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            <Button
              type="button"
              onClick={() =>
                setMeta((prev) => ({
                  ...prev,
                  assets: prev.assets
                    ? [
                        ...prev.assets,
                        { type: "youtube", name: "YouTube", url: "" },
                      ]
                    : [
                        {
                          type: "youtube",
                          name: "YouTube",
                          url: "",
                        },
                      ],
                }))
              }
              className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              新增資源
            </Button>
          </div>

          {/* <div>
            <span className="text-sm text-slate-500">meta 預覽</span>
            <pre className="bg-slate-100 p-4 rounded-lg text-sm text-slate-800 overflow-x-auto">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div> */}
        </div>

        {/* Right */}
        <div className="lg:col-span-5 space-y-6">
          {downloadComponent}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">設定預設編曲</h2>
            {/* Flow Builder */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">歌序</span>
                <span className="text-[11px] text-slate-400 ml-auto mr-1">
                  段落：
                </span>
                <div className="flex flex-wrap max-w-[80%] w-full items-center gap-1">
                  {sections.map((preset, presetIndex) => {
                    const tag = getFlowName(preset.name);
                    const tagIndex = presetIndex;
                    return (
                      <button
                        key={`tag-${tagIndex}`}
                        type="button"
                        onClick={() =>
                          setMeta((prev) => {
                            const newArrangement = prev.arrangement
                              ? [...prev.arrangement]
                              : [];
                            newArrangement.push(tagIndex);
                            return {
                              ...prev,
                              arrangement: newArrangement,
                            };
                          })
                        }
                        className="whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {/* gap */}
                  <div className="flex-initial flex-shrink-0 w-px h-3 bg-slate-200 mx-1"></div>
                  {EX_FLOWS.map((preset, presetIndex) => {
                    const tag = getFlowName(preset);
                    const tagIndex = presetIndex + (sections.length || 0);
                    return (
                      <button
                        key={`tag-${tagIndex}`}
                        type="button"
                        onClick={() =>
                          setMeta((prev) => {
                            const newArrangement = prev.arrangement
                              ? [...prev.arrangement]
                              : [];
                            newArrangement.push(tagIndex);
                            return {
                              ...prev,
                              arrangement: newArrangement,
                            };
                          })
                        }
                        className="whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Flow badges sequence */}
              {meta.arrangement && meta.arrangement.length > 0 ? (
                <>
                  <div className="w-full inline-block items-center !mt-1 px-2 pt-1 pb-2 bg-white rounded-xl border border-slate-200/80 min-h-[36px]">
                    {meta.arrangement.map((tagIndex, tIndex) => {
                      const tag =
                        tagIndex < (sections.length || 0)
                          ? sections[tagIndex].name
                          : tagIndex < (sections.length || 0) + EX_FLOWS.length
                            ? EX_FLOWS[tagIndex - (sections.length || 0)]
                            : "?";
                      return (
                        <div
                          className="mt-1 inline-block text-wrap items-center"
                          key={tIndex}
                        >
                          <ContextMenu.Root>
                            <ContextMenu.Trigger asChild>
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-100"
                                style={{
                                  backgroundColor:
                                    (FLOW_STYLE[tag as keyof FlowMapping] ??
                                      FLOW_STYLE["default"]) + "22",
                                  color:
                                    FLOW_STYLE[tag as keyof FlowMapping] ??
                                    FLOW_STYLE["default"],
                                  borderColor:
                                    (FLOW_STYLE[tag as keyof FlowMapping] ??
                                      FLOW_STYLE["default"]) + "44",
                                }}
                              >
                                {getFlowName(tag)}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMeta((prev) => {
                                      const newArrangement = prev.arrangement
                                        ? [...prev.arrangement]
                                        : [];
                                      newArrangement.splice(tIndex, 1);
                                      return {
                                        ...prev,
                                        arrangement: newArrangement,
                                      };
                                    });
                                  }}
                                  className="hover:text-rose-600 transition-colors ml-0.5 select-none"
                                >
                                  ×
                                </button>
                              </span>
                            </ContextMenu.Trigger>
                            <ContextMenu.Content className="bg-white rounded-lg shadow-lg border border-slate-200/80 p-2 min-w-[120px] z-50">
                              {/* 左移、右移、更換 */}
                              <ContextMenu.Item
                                onSelect={() => {
                                  setMeta((prev) => {
                                    if (!prev.arrangement) return prev;
                                    const newArrangement = [
                                      ...prev.arrangement,
                                    ];
                                    if (tIndex > 0) {
                                      const temp = newArrangement[tIndex - 1];
                                      newArrangement[tIndex - 1] =
                                        newArrangement[tIndex];
                                      newArrangement[tIndex] = temp;
                                    }
                                    return {
                                      ...prev,
                                      arrangement: newArrangement,
                                    };
                                  });
                                }}
                                className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                              >
                                左移
                              </ContextMenu.Item>
                              <ContextMenu.Item
                                onSelect={() => {
                                  setMeta((prev) => {
                                    if (!prev.arrangement) return prev;
                                    const newArrangement = [
                                      ...prev.arrangement,
                                    ];
                                    if (tIndex < newArrangement.length - 1) {
                                      const temp = newArrangement[tIndex + 1];
                                      newArrangement[tIndex + 1] =
                                        newArrangement[tIndex];
                                      newArrangement[tIndex] = temp;
                                    }
                                    return {
                                      ...prev,
                                      arrangement: newArrangement,
                                    };
                                  });
                                }}
                                className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                              >
                                右移
                              </ContextMenu.Item>
                              <ContextMenu.Separator className="my-1 border-t border-slate-200" />
                              {sections.map((preset, presetIndex) => {
                                const presetTag = getFlowName(preset.name);
                                const presetTagIndex = presetIndex;
                                return (
                                  <ContextMenu.Item
                                    key={`replace-${presetTagIndex}`}
                                    onSelect={() => {
                                      setMeta((prev) => {
                                        if (!prev.arrangement) return prev;
                                        const newArrangement = [
                                          ...prev.arrangement,
                                        ];
                                        newArrangement[tIndex] = presetTagIndex;
                                        return {
                                          ...prev,
                                          arrangement: newArrangement,
                                        };
                                      });
                                    }}
                                    className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                                  >
                                    更換為 {presetTag}
                                  </ContextMenu.Item>
                                );
                              })}
                              {EX_FLOWS.map((preset, presetIndex) => {
                                const presetTag = getFlowName(preset);
                                const presetTagIndex =
                                  presetIndex + (sections.length || 0);
                                return (
                                  <ContextMenu.Item
                                    key={`replace-ex-${presetTagIndex}`}
                                    onSelect={() => {
                                      setMeta((prev) => {
                                        if (!prev.arrangement) return prev;
                                        const newArrangement = [
                                          ...prev.arrangement,
                                        ];
                                        newArrangement[tIndex] = presetTagIndex;
                                        return {
                                          ...prev,
                                          arrangement: newArrangement,
                                        };
                                      });
                                    }}
                                    className="px-2 py-1 text-sm text-slate-700 hover:bg-indigo-50 rounded cursor-pointer"
                                  >
                                    更換為 {presetTag}
                                  </ContextMenu.Item>
                                );
                              })}
                            </ContextMenu.Content>
                          </ContextMenu.Root>
                          {meta.arrangement &&
                            tIndex < meta.arrangement.length - 1 && (
                              <>
                                <span style={{ fontSize: 0 }}> </span>
                                <span className="text-slate-300 text-xs select-none mx-1">
                                  ➔
                                </span>
                              </>
                            )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="w-full flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setMeta((prev) => ({ ...prev, arrangement: [] }))
                      }
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium select-none transition-colors"
                    >
                      清除歌序
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-400 italic">
                  尚未設定流程（點選上方標籤即可依序加入流程）
                </div>
              )}
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">歌詞預覽</h2>
            {/* Render parsed sections */}
            {sections.length > 0 ? (
              <LyricsViewer
                song={{ meta, sections }}
                readonly={true}
                ui={{ container: "!border-0 !p-2 !shadow-none" }}
              />
            ) : (
              <p>No sections parsed yet.</p>
            )}
          </div>
          {downloadComponent}
        </div>
      </div>
    </div>
  );
};
