import { type ProFormat } from "propresenter-js";

interface LyricsModalPreviewProps {
  proFormat: ProFormat;
}

export const LyricsModalPreview: React.FC<LyricsModalPreviewProps> = ({
  proFormat,
}) => {
  return (
    <div>
      <pre className="whitespace-pre-wrap break-words">
        {JSON.stringify(proFormat, null, 2)}
      </pre>
    </div>
  );
};
