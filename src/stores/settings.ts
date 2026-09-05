import { persistentAtom } from "@nanostores/persistent";
import LZString from "lz-string";

import {
  EXPORT_OPTIONS_DEFAULT,
  EXPORT_TEMPLATE_DEFAULT,
} from "@/constants/setting";

export const songExportOptions = persistentAtom(
  "songExportOptions",
  EXPORT_OPTIONS_DEFAULT,
  {
    encode: JSON.stringify,
    decode: JSON.parse,
  },
);

export const songExportTemplate = persistentAtom(
  "songExportTemplate",
  EXPORT_TEMPLATE_DEFAULT,
  {
    encode: (value) => {
      if (!value) return "";
      try {
        const json = JSON.stringify(value);
        return LZString.compressToEncodedURIComponent(json);
      } catch (err) {
        console.error("Failed to encode song export template:", err);
        return "";
      }
    },
    decode: (value) => {
      if (!value) return {};
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(value);
        if (!decompressed) return {};
        return JSON.parse(decompressed);
      } catch (err) {
        console.error("Failed to decode song export template:", err);
        return {};
      }
    },
  },
);
