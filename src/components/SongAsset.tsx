import React from "react";

import type { SongAsset as SongAssetType } from "@/content.config";
import { analyzeYoutubeUrl, formatSecondsDisplay } from "@/utils/youtube";
import {
  FileText,
  FileSpreadsheet,
  SquarePlay,
  Music,
  ExternalLink,
  Download,
  AlertCircle,
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

export const SongAsset: React.FC<{ asset: SongAssetType }> = ({ asset }) => {
  const IconComponent = getAssetIcon(asset.type);
  const isExternal =
    ["youtube", "other"].includes(asset.type) || asset.url.startsWith("http");

  const ytAnalysis =
    asset.type === "youtube" ? analyzeYoutubeUrl(asset.url) : null;
  const ytTarget = ytAnalysis?.target ?? null;
  const anchorHref = ytTarget?.externalUrl || asset.url;

  const hasTimeRange =
    ytTarget &&
    (ytTarget.startSeconds !== undefined || ytTarget.endSeconds !== undefined);
  const timeRangeLabel = hasTimeRange
    ? `${ytTarget.startSeconds !== undefined ? formatSecondsDisplay(ytTarget.startSeconds) : "0:00"}${
        ytTarget.endSeconds !== undefined
          ? ` – ${formatSecondsDisplay(ytTarget.endSeconds)}`
          : " 起"
      }`
    : null;

  return (
    <div className="flex flex-col p-2 rounded-2xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-200 transition-all group">
      <a
        href={anchorHref}
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
            {(asset.size || timeRangeLabel) && (
              <div className="text-xs text-slate-400">
                {[asset.size, timeRangeLabel ? `片段 ${timeRangeLabel}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
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
      {asset.type === "youtube" &&
        (ytTarget ? (
          <iframe
            className="w-full aspect-video rounded-lg border border-slate-200/80 bg-slate-950"
            src={ytTarget.embedUrl}
            title={asset.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <div className="w-full aspect-video rounded-lg border border-rose-200 bg-rose-50/90 flex flex-col items-center justify-center p-4 text-center gap-2 text-rose-700">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <div className="text-xs font-semibold text-rose-900">
              無法載入 YouTube 影片
            </div>
            <p className="text-[11px] text-rose-700 max-w-sm">
              {ytAnalysis?.error || "YouTube 連結格式無效"}
            </p>
          </div>
        ))}
    </div>
  );
};
