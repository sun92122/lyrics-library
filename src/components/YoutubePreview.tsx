import React, { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, ListVideo, Loader2 } from "lucide-react";

export interface YoutubePreviewProps {
  embedUrl?: string | null;
  externalUrl?: string | null;
  title?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  errorTitle?: string;
  errorMessage?: string | null;
  statusDetail?: string | null;
  pendingHint?: string | null;
  className?: string;
}

export const YoutubePreview: React.FC<YoutubePreviewProps> = ({
  embedUrl,
  externalUrl,
  title = "YouTube 內嵌預覽",
  emptyTitle = "尚未載入 YouTube 預覽",
  emptyMessage = "輸入 YouTube 連結並於失焦後顯示預覽",
  errorTitle = "無法載入 YouTube 預覽",
  errorMessage,
  statusDetail,
  pendingHint,
  className = "",
}) => {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const [slowLoad, setSlowLoad] = useState(false);

  const normalizedEmbedUrl = embedUrl?.trim() || null;
  const isIframeError = Boolean(
    normalizedEmbedUrl && erroredUrl === normalizedEmbedUrl,
  );
  const isLoading = Boolean(
    normalizedEmbedUrl &&
    !errorMessage &&
    loadedUrl !== normalizedEmbedUrl &&
    erroredUrl !== normalizedEmbedUrl,
  );

  useEffect(() => {
    if (!normalizedEmbedUrl) {
      setLoadedUrl(null);
      setErroredUrl(null);
      setSlowLoad(false);
      return;
    }

    setSlowLoad(false);
    const timer = window.setTimeout(() => {
      setSlowLoad(true);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [normalizedEmbedUrl]);

  const effectiveError =
    errorMessage ||
    (isIframeError
      ? "YouTube 播放器載入失敗，請確認網路連線、網址是否正確或影片是否允許嵌入。"
      : null);

  return (
    <div
      className={`relative w-full aspect-video overflow-hidden rounded-2xl border ${
        effectiveError
          ? "border-rose-200 bg-rose-50/90"
          : !normalizedEmbedUrl
            ? "border-dashed border-slate-300 bg-slate-100/80"
            : "border-slate-200/80 bg-slate-950"
      } ${className}`}
    >
      {pendingHint && (
        <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none px-2.5 py-1 rounded-full bg-amber-400/95 text-slate-950 text-[11px] font-semibold shadow-sm backdrop-blur-sm">
          {pendingHint}
        </div>
      )}

      {effectiveError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md">
            <div className="text-sm font-bold text-rose-900">{errorTitle}</div>
            <p className="text-xs text-rose-700 leading-relaxed">
              {effectiveError}
            </p>
          </div>
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
            >
              <span>前往 YouTube 確認</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ) : !normalizedEmbedUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center shadow-sm">
            <ListVideo className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md">
            <div className="text-sm font-semibold text-slate-700">
              {emptyTitle}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {emptyMessage}
            </p>
          </div>
        </div>
      ) : (
        <>
          <iframe
            key={normalizedEmbedUrl}
            src={normalizedEmbedUrl}
            title={title}
            className="w-full h-full block bg-slate-950"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={() => {
              setErroredUrl(null);
              setLoadedUrl(normalizedEmbedUrl);
            }}
            onError={() => {
              setErroredUrl(normalizedEmbedUrl);
            }}
          />

          {isLoading && (
            <div className="absolute inset-0 z-10 bg-slate-900/95 text-slate-100 flex flex-col items-center justify-center p-5 text-center gap-3">
              <Loader2 className="w-7 h-7 text-rose-400 animate-spin" />
              <div className="space-y-1 max-w-md">
                <div className="text-sm font-semibold text-white">
                  載入 YouTube 預覽中...
                </div>
                {statusDetail && (
                  <p className="text-xs text-slate-300">{statusDetail}</p>
                )}
                {slowLoad && (
                  <p className="text-[11px] text-amber-300 leading-relaxed pt-0.5">
                    載入時間較長，可能是網路連線較慢或原影片不允許嵌入播放。
                  </p>
                )}
              </div>
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
                >
                  <span>在 YouTube 開啟</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
