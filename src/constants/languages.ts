export interface LanguageItem {
  code: string;
  name: string;
  nativeName?: string;
  englishName?: string;
}

export const DEFAULT_LANGUAGES: LanguageItem[] = [
  {
    code: "zh",
    name: "中文",
    englishName: "Chinese",
    nativeName: "中文",
  },
  {
    code: "en",
    name: "English",
    englishName: "English",
    nativeName: "English",
  },
  {
    code: "zh-TW",
    name: "繁體中文",
    englishName: "Traditional Chinese",
    nativeName: "繁體中文",
  },
  {
    code: "zh-CN",
    name: "簡體中文",
    englishName: "Simplified Chinese",
    nativeName: "简体中文",
  },
  {
    code: "zh-HK",
    name: "粵語 / 繁體中文 (香港)",
    englishName: "Cantonese / Hong Kong",
    nativeName: "廣東話",
  },
  {
    code: "ko",
    name: "韓文",
    englishName: "Korean",
    nativeName: "한국어",
  },
  {
    code: "ja",
    name: "日文",
    englishName: "Japanese",
    nativeName: "日本語",
  },
  {
    code: "id",
    name: "印尼文",
    englishName: "Indonesian",
    nativeName: "Bahasa Indonesia",
  },
  {
    code: "es",
    name: "西班牙文",
    englishName: "Spanish",
    nativeName: "Español",
  },
  {
    code: "fr",
    name: "法文",
    englishName: "French",
    nativeName: "Français",
  },
  {
    code: "de",
    name: "德文",
    englishName: "German",
    nativeName: "Deutsch",
  },
  {
    code: "pt",
    name: "葡萄牙文",
    englishName: "Portuguese",
    nativeName: "Português",
  },
  {
    code: "it",
    name: "義大利文",
    englishName: "Italian",
    nativeName: "Italiano",
  },
  {
    code: "vi",
    name: "越南文",
    englishName: "Vietnamese",
    nativeName: "Tiếng Việt",
  },
  {
    code: "th",
    name: "泰文",
    englishName: "Thai",
    nativeName: "ไทย",
  },
  {
    code: "ms",
    name: "馬來文",
    englishName: "Malay",
    nativeName: "Bahasa Melayu",
  },
  {
    code: "tl",
    name: "菲律賓文",
    englishName: "Tagalog",
    nativeName: "Tagalog",
  },
  {
    code: "he",
    name: "希伯來文",
    englishName: "Hebrew",
    nativeName: "עברית",
  },
  {
    code: "el",
    name: "希臘文",
    englishName: "Greek",
    nativeName: "Ελληνικά",
  },
  {
    code: "la",
    name: "拉丁文",
    englishName: "Latin",
    nativeName: "Latina",
  },
  {
    code: "ru",
    name: "俄文",
    englishName: "Russian",
    nativeName: "Русский",
  },
  {
    code: "ar",
    name: "阿拉伯文",
    englishName: "Arabic",
    nativeName: "العربية",
  },
  {
    code: "nl",
    name: "荷蘭文",
    englishName: "Dutch",
    nativeName: "Nederlands",
  },
  {
    code: "sv",
    name: "瑞典文",
    englishName: "Swedish",
    nativeName: "Svenska",
  },
  {
    code: "no",
    name: "挪威文",
    englishName: "Norwegian",
    nativeName: "Norsk",
  },
  {
    code: "da",
    name: "丹麥文",
    englishName: "Danish",
    nativeName: "Dansk",
  },
  {
    code: "fi",
    name: "芬蘭文",
    englishName: "Finnish",
    nativeName: "Suomi",
  },
  {
    code: "pl",
    name: "波蘭文",
    englishName: "Polish",
    nativeName: "Polski",
  },
  {
    code: "uk",
    name: "烏克蘭文",
    englishName: "Ukrainian",
    nativeName: "Українська",
  },
  {
    code: "sw",
    name: "斯瓦希里文",
    englishName: "Swahili",
    nativeName: "Kiswahili",
  },
  {
    code: "hi",
    name: "印地文",
    englishName: "Hindi",
    nativeName: "हिन्दी",
  },
  {
    code: "my",
    name: "緬甸文",
    englishName: "Burmese",
    nativeName: "မြန်မာစာ",
  },
];

const CODE_TO_NAME_MAP: Record<string, string> = {
  zh: "中文",
  en: "English",
  "zh-tw": "繁體中文",
  "zh-cn": "簡體中文",
  "zh-hk": "粵語 / 繁體中文 (香港)",
  ko: "韓文",
  ja: "日文",
  id: "印尼文",
  es: "西班牙文",
  fr: "法文",
  de: "德文",
  pt: "葡萄牙文",
  it: "義大利文",
  vi: "越南文",
  th: "泰文",
  ms: "馬來文",
  tl: "菲律賓文",
  he: "希伯來文",
  el: "希臘文",
  la: "拉丁文",
  ru: "俄文",
  ar: "阿拉伯文",
  nl: "荷蘭文",
  sv: "瑞典文",
  no: "挪威文",
  da: "丹麥文",
  fi: "芬蘭文",
  pl: "波蘭文",
  uk: "烏克蘭文",
  sw: "斯瓦希里文",
  hi: "印地文",
  my: "緬甸文",
};

const NAME_TO_CODE_MAP: Record<string, string> = {
  中文: "zh",
  chinese: "zh",
  english: "en",
  英文: "en",
  英語: "en",
  繁體中文: "zh-TW",
  簡體中文: "zh-CN",
  "粵語 / 繁體中文 (香港)": "zh-HK",
  廣東話: "zh-HK",
  粵語: "zh-HK",
  韓文: "ko",
  韓國語: "ko",
  korean: "ko",
  한국어: "ko",
  日文: "ja",
  日本語: "ja",
  japanese: "ja",
  印尼文: "id",
  indonesian: "id",
  "bahasa indonesia": "id",
  西班牙文: "es",
  spanish: "es",
  español: "es",
  法文: "fr",
  french: "fr",
  français: "fr",
  德文: "de",
  german: "de",
  deutsch: "de",
  葡萄牙文: "pt",
  portuguese: "pt",
  português: "pt",
  義大利文: "it",
  italian: "it",
  italiano: "it",
  越南文: "vi",
  vietnamese: "vi",
  "tiếng việt": "vi",
  泰文: "th",
  thai: "th",
  ไทย: "th",
  馬來文: "ms",
  malay: "ms",
  "bahasa melayu": "ms",
  菲律賓文: "tl",
  tagalog: "tl",
  希伯來文: "he",
  hebrew: "he",
  עברית: "he",
  希臘文: "el",
  greek: "el",
  ελληνικά: "el",
  拉丁文: "la",
  latin: "la",
  latina: "la",
  俄文: "ru",
  russian: "ru",
  русский: "ru",
  阿拉伯文: "ar",
  arabic: "ar",
  العربية: "ar",
};

let displayNamesFormatter: Intl.DisplayNames | null = null;
try {
  if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    displayNamesFormatter = new Intl.DisplayNames(["zh-Hant", "zh-TW", "zh"], {
      type: "language",
    });
  }
} catch {
  // fallback if Intl.DisplayNames not supported
}

/**
 * Converts an i18n language code (or legacy language name) into a display name.
 * e.g.:
 * - "zh" -> "中文"
 * - "en" -> "English"
 * - "ko" -> "韓文"
 * - "中文" -> "中文"
 */
export function getLanguageName(codeOrName?: string | null): string {
  if (!codeOrName || !codeOrName.trim()) return "";
  const trimmed = codeOrName.trim();
  const lower = trimmed.toLowerCase();

  // If already mapped directly
  if (CODE_TO_NAME_MAP[lower]) {
    return CODE_TO_NAME_MAP[lower];
  }

  // If passed as a known display name (e.g. "中文", "English")
  if (NAME_TO_CODE_MAP[lower] || NAME_TO_CODE_MAP[trimmed]) {
    return trimmed;
  }

  // Fallback to Intl.DisplayNames if it is a valid BCP 47 code
  if (displayNamesFormatter) {
    try {
      const resolved = displayNamesFormatter.of(trimmed);
      if (resolved && resolved !== trimmed) {
        return resolved;
      }
    } catch {
      // not a recognized code, return original
    }
  }

  return trimmed;
}

/**
 * Converts a language name or code into a standard i18n code.
 * e.g.:
 * - "中文" -> "zh"
 * - "English" -> "en"
 * - "zh" -> "zh"
 * - "EN" -> "en"
 */
export function getLanguageCode(nameOrCode?: string | null): string {
  if (!nameOrCode || !nameOrCode.trim()) return "";
  const trimmed = nameOrCode.trim();
  const lower = trimmed.toLowerCase();

  if (NAME_TO_CODE_MAP[trimmed]) {
    return NAME_TO_CODE_MAP[trimmed];
  }
  if (NAME_TO_CODE_MAP[lower]) {
    return NAME_TO_CODE_MAP[lower];
  }

  // Check if it's already a valid code in DEFAULT_LANGUAGES
  const found = DEFAULT_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (found) {
    return found.code;
  }

  return lower;
}
