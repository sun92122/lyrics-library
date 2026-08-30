import React, { useState, useEffect } from 'react';
import type { SongData } from '@/content/config';
import { KeyController } from './KeyController';
import { LyricsViewer } from './LyricsViewer';

export interface SongViewContainerProps {
  song: SongData;
}

export const SongViewContainer: React.FC<SongViewContainerProps> = ({ song }) => {
  const defaultKey = song.meta.originalKey || 'C';
  const [currentKey, setCurrentKey] = useState<string>(defaultKey);

  // Initialize key from URL parameter if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const keyFromUrl = urlParams.get('key');
      if (keyFromUrl) {
        setCurrentKey(keyFromUrl);
      }
    }
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
      <LyricsViewer song={song} currentKey={currentKey} />
    </div>
  );
};
