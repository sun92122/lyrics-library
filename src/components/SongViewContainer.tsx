import React, { useState, useEffect } from "react";
import type { SongData } from "@/content/config";
import { KeyController } from "./KeyController";
import { LyricsViewer } from "./LyricsViewer";

export interface SongViewContainerProps {
  song: SongData;
}

export const SongViewContainer: React.FC<SongViewContainerProps> = ({
  song,
}) => {
  const defaultKey = song.meta.originalKey || "C";
  const [currentKey, setCurrentKey] = useState<string>(defaultKey);
  const [currentFlow, setCurrentFlow] = useState<string[] | undefined>(
    undefined,
  );
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    const paramsHash = () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      setCurrentHash(decodeURIComponent(hash));

      // #{key}---{flow}
      const match = hash.match(/#([^---]+)(?:---(.+))?/);
      if (match) {
        const keyParam = match[1];
        const flowParam = match[2] ?? undefined;

        if (keyParam) {
          setCurrentKey(keyParam);
        }
        if (flowParam) {
          setCurrentFlow(flowParam.split(","));
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
      {/* Interactive Floating / Sticky Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <KeyController
            originalKey={defaultKey}
            currentKey={currentKey}
            onKeyChange={setCurrentKey}
          />
        </div>
      </div>

      {/* Main Lyrics Display */}
      <LyricsViewer
        song={song}
        currentKey={currentKey}
        currentFlow={currentFlow}
      />
    </div>
  );
};
