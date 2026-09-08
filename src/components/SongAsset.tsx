import React from "react";

import type { SongAsset as SongAssetType } from "@/content/config";
import {
  FileText,
  FileSpreadsheet,
  SquarePlay,
  Music,
  ExternalLink,
  Download,
  ArrowLeft,
  Tag,
  Metronome,
  User,
  Hash,
} from "lucide-react";

// Helper to determine asset icon
const getAssetIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return FileText;
    case "video":
      return SquarePlay;
    case "audio":
      return Music;
    case "slide":
      return FileSpreadsheet;
    case "youtube":
      return SquarePlay;
    default:
      return ExternalLink;
  }
};

const getYoutubeEmbedUrl = (url: string) => {
  const urlObj = new URL(url);
  const videoId = urlObj.searchParams.get("v");
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};

export const SongAsset: React.FC<{ asset: SongAssetType }> = ({ asset }) => {
  const IconComponent = getAssetIcon(asset.type);
  const isExternal =
    asset.type in ["youtube", "other"] || asset.url.startsWith("http");

  return (
    <div className="flex flex-col p-2 rounded-2xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-200 transition-all group">
      <a
        href={asset.url}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        download={!isExternal}
        className="flex items-center justify-between w-full gap-3 pb-4 p-2 sm:p-5 rounded-2xl transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm border border-slate-200/60 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <IconComponent className="w-5 h-5" />
          </div>
          <div>
            <div className="font-medium text-slate-900 group-hover:text-indigo-900 transition-colors">
              {asset.name}
            </div>
            {asset.size && (
              <div className="text-xs text-slate-400">{asset.size}</div>
            )}
          </div>
        </div>

        <div className="text-slate-400 group-hover:text-indigo-600 transition-colors">
          {isExternal ? (
            <ExternalLink className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </div>
      </a>
      {asset.type === "youtube" && (
        <iframe
          id="ytplayer"
          className="w-full aspect-video rounded-lg border border-slate-200/80"
          src={getYoutubeEmbedUrl(asset.url)}
          title={asset.name}
          allowFullScreen
        />
      )}
    </div>
  );
};
