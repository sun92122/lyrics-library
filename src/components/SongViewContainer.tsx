import React, { useState, useEffect } from "react";
import type { SongData } from "@/content.config";
import { LyricsViewer } from "./LyricsViewer";
import { flow } from "@/stores/settings";

export interface SongViewContainerProps {
  song: SongData;
}

export const SongViewContainer: React.FC<SongViewContainerProps> = ({
  song,
}) => {
  const defaultKey = song.meta.originalKey;
  const [currentKey, setCurrentKey] = useState<string | undefined>(defaultKey);
  const [currentFlow, setCurrentFlow] = useState<number[] | undefined>(
    undefined,
  );
  const [customFlow, setCustomFlow] = useState<string[] | undefined>(undefined);
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    const paramsHash = () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      setCurrentHash(decodeURIComponent(hash));

      // #{key}---{flow}---{customFlow}
      const match = hash.match(/#([^#]+)---([^#]*)---([^#]*)/);
      if (match) {
        const keyParam = match[1];
        const flowParam = match[2] ?? undefined;
        const customFlowParam = match[3] ?? undefined;

        if (keyParam) {
          setCurrentKey(keyParam);
        }
        if (customFlowParam) {
          setCustomFlow(customFlowParam.split(","));
        }
        if (flowParam) {
          const flowArray = flowParam
            .split(",")
            .map((tag) => {
              return parseInt(tag, 10);
            })
            .filter((tag) => !isNaN(tag));
          setCurrentFlow(flowArray.length > 0 ? flowArray : undefined);
          flow.set(flowArray.length > 0 ? flowArray : undefined);
        }
      }
    };

    paramsHash();
    window.addEventListener("hashchange", paramsHash);
    return () => {
      window.removeEventListener("hashchange", paramsHash);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Main Lyrics Display */}
      <LyricsViewer
        song={song}
        originalKey={defaultKey}
        currentKey={currentKey}
        onKeyChange={setCurrentKey}
        currentFlow={currentFlow}
        customFlow={customFlow}
      />
    </div>
  );
};
