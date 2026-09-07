import { useState } from "react";
import { RTFJS } from "rtf.js";

import { type ProFormat, type Slide, type Group } from "propresenter-js";
import { FLOW_ALIASES, FLOW_STYLE } from "@/constants/flow";

interface LyricsModalPreviewProps {
  proFormat: ProFormat;
}

RTFJS.loggingEnabled(false); // Disable logging for RTFJS

export const LyricsModalPreview: React.FC<LyricsModalPreviewProps> = ({
  proFormat,
}) => {
  return (
    <div>
      {proFormat.groups.map((group, index) => {
        const slides = group.slideUuids
          .map((uuid) => proFormat.slides.find((s) => s.uuid === uuid))
          .filter((s): s is Slide => s !== undefined);
        const startIndex = proFormat.groups
          .slice(0, index)
          .reduce((acc, g) => acc + g.slideUuids.length, 0);
        if (slides.length === 0) return null;
        const groupName = group ? group.name : "No Group";
        const groupColor =
          group && group.color
            ? `rgb(${group.color.red}, ${group.color.green}, ${group.color.blue})`
            : group?.name && group?.name in FLOW_ALIASES
              ? FLOW_STYLE[FLOW_ALIASES[group.name] as keyof typeof FLOW_STYLE]
              : FLOW_STYLE["default"];
        return (
          <div
            key={`group-preview-${index}`}
            className="mb-4 flex flex-wrap gap-0 shadow-sm rounded-md px-1.5 py-2 max-md:max-w-min md:max-w-[33.75rem]"
            style={{
              backgroundColor: groupColor + "80",
              maxWidth: slides.length > 1 ? undefined : "min-content",
            }}
          >
            <div
              className="font-bold mb-2 ml-2 w-auto min-w-[50.5%]"
              style={{
                color: groupColor,
              }}
            >
              {groupName}
            </div>
            {slides.map((slide, slideIndex) => (
              <div key={startIndex + slideIndex + 1} className="mx-1 my-2">
                <LyricsModalPreviewSlide slide={slide} />
                <div className="flex w-full md:max-w-64 max-w-[calc(100vw - 6rem)] px-2 bg-gray-500/60 rounded-b-md text-slate-700 text-sm font-semibold">
                  {startIndex + slideIndex + 1}
                  {slide.label && (
                    <span className="ml-auto text-gray-700/80">
                      {slide.label}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

function stringToArrayBuffer(string: string): ArrayBuffer {
  const buffer = new ArrayBuffer(string.length);
  const bufferView = new Uint8Array(buffer);
  for (let i = 0; i < string.length; i++) {
    bufferView[i] = string.charCodeAt(i);
  }
  return buffer;
}
function uint8ArrayToString(uint8Array: Uint8Array): string {
  let result = "";
  for (let i = 0; i < uint8Array.length; i++) {
    result += String.fromCharCode(uint8Array[i]);
  }
  return result;
}
const LyricsModalPreviewSlide: React.FC<{ slide: Slide }> = ({ slide }) => {
  return (
    <div className="relative w-[1920px] h-[1080px] bg-black overflow-hidden slide-preview origin-center font-bold">
      {slide.elements.map((element, index) => {
        const contentId = slide.uuid + "-" + index;
        const doc = new RTFJS.Document(
          stringToArrayBuffer(
            element.textRtf
              ? uint8ArrayToString(element.textRtf)
              : `{\\rtf1\\ansi\\ansicpg950{\\fonttbl\\f0\\fswiss Helvetica;}
            {\\colortbl;\\red255\\green255\\blue255;\\red255\\green255\\blue255;}
            \\pard \\f0\\fs24\\cf2 }`,
          ),
          {},
        );

        doc.render().then((html) => {
          if (!document.getElementById(contentId)) {
            return;
          }
          document.getElementById(contentId)!.innerHTML = html
            .map((el) => el.outerHTML)
            .join("");
        });

        const height = element?.bounds?.height || 1080;
        const width = element?.bounds?.width || 1920;
        const left = element?.bounds?.x || 0;
        const top = element?.bounds?.y || 0;

        return (
          <div
            key={contentId}
            id={contentId}
            className="absolute inline-block overflow-hidden float-start"
            style={{
              width: width + "px",
              height: height + "px",
              left: left + "px",
              top: top + "px",
              alignContent: ["flex-start", "center", "flex-end"][
                element?.align ?? 1
              ],
              zIndex: 999 - index,
            }}
          />
        );
      })}
    </div>
  );
};
