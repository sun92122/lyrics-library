import React, { useState, useMemo } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import {
  DEFAULT_LANGUAGES,
  getLanguageName,
  getLanguageCode,
  type LanguageItem,
} from "@/constants/languages";

interface LanguageComboboxProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
  allowClear?: boolean;
  required?: boolean;
  className?: string;
}

export const LanguageCombobox: React.FC<LanguageComboboxProps> = ({
  value,
  onChange,
  label,
  placeholder = "請搜尋或選擇語言...",
  allowClear = false,
  required = false,
  className = "",
}) => {
  const [query, setQuery] = useState("");

  const filteredLanguages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEFAULT_LANGUAGES;

    return DEFAULT_LANGUAGES.filter((item) => {
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.englishName && item.englishName.toLowerCase().includes(q)) ||
        (item.nativeName && item.nativeName.toLowerCase().includes(q))
      );
    });
  }, [query]);

  const customQueryCode = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const exists = DEFAULT_LANGUAGES.some(
      (l) => l.code.toLowerCase() === q || l.name.toLowerCase() === q,
    );
    if (exists) return null;
    return getLanguageCode(q) || q;
  }, [query]);

  const formatDisplay = (code: string | null) => {
    if (!code) return "";
    const name = getLanguageName(code);
    return name && name.toLowerCase() !== code.toLowerCase()
      ? `${name} (${code})`
      : code;
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <Combobox
        value={value}
        onChange={(val) => {
          onChange(val || "");
          setQuery("");
        }}
        onClose={() => setQuery("")}
      >
        <div className="relative">
          <ComboboxInput
            displayValue={formatDisplay}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-300 p-3 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow bg-white"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
            {allowClear && value && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                  setQuery("");
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 transition-colors"
                title="清除"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ComboboxButton className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors">
              <ChevronsUpDown className="w-4 h-4" />
            </ComboboxButton>
          </div>

          <ComboboxOptions
            anchor="bottom start"
            className="z-50 mt-1 max-h-64 w-[var(--input-width)] overflow-auto rounded-xl bg-white p-1 text-sm shadow-xl ring-1 ring-slate-200 focus:outline-none"
          >
            {allowClear && (
              <ComboboxOption
                value=""
                className="cursor-pointer select-none rounded-lg py-2 px-3 data-[focus]:bg-slate-100 text-slate-500 flex items-center justify-between text-xs sm:text-sm border-b border-slate-100 mb-1"
              >
                <span className="italic font-normal">無（未設定次要語言）</span>
                {!value && <Check className="w-4 h-4 text-slate-400" />}
              </ComboboxOption>
            )}

            {customQueryCode && (
              <ComboboxOption
                value={customQueryCode}
                className="cursor-pointer select-none rounded-lg py-2 px-3 data-[focus]:bg-indigo-50 text-indigo-700 flex items-center justify-between text-xs sm:text-sm border-b border-indigo-100 mb-1"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">使用自訂代碼：</span>
                  <span className="font-mono font-semibold">
                    {customQueryCode}
                  </span>
                </div>
                {value === customQueryCode && (
                  <Check className="w-4 h-4 text-indigo-600" />
                )}
              </ComboboxOption>
            )}

            {filteredLanguages.length === 0 && !customQueryCode ? (
              <div className="py-3 px-4 text-xs text-slate-400 text-center">
                找不到相符的語言
              </div>
            ) : (
              filteredLanguages.map((lang: LanguageItem) => (
                <ComboboxOption
                  key={lang.code}
                  value={lang.code}
                  className="cursor-pointer select-none rounded-lg py-2 px-3 data-[focus]:bg-indigo-50 data-[focus]:text-indigo-900 text-slate-800 flex items-center justify-between text-xs sm:text-sm transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden pr-2">
                    <span className="font-medium text-slate-900 truncate">
                      {lang.name}
                    </span>
                    {lang.nativeName && lang.nativeName !== lang.name && (
                      <span className="text-slate-400 text-xs truncate">
                        {lang.nativeName}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {lang.code}
                    </span>
                  </div>
                  {value === lang.code && (
                    <Check className="w-4 h-4 text-indigo-600 flex-shrink-0 ml-2" />
                  )}
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
};
