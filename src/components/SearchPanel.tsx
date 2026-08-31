import React, { useState, useEffect, useMemo } from "react";
import MiniSearch from "minisearch";
import type { SearchDoc } from "@/pages/search-index.json";
import { Search, X, Music, ArrowRight, Sparkles, Filter } from "lucide-react";

export interface SearchPanelProps {
  initialDocs: SearchDoc[];
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ initialDocs }) => {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [docs, setDocs] = useState<SearchDoc[]>(initialDocs);

  // Extract all unique tags with song counts
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    docs.forEach((doc) => {
      doc.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  // Initialize MiniSearch instance with CJK-friendly tokenizer
  const miniSearch = useMemo(() => {
    const ms = new MiniSearch<SearchDoc>({
      fields: ["titleA", "titleB", "lyricsA", "lyricsB", "author", "tags"],
      storeFields: [
        "id",
        "titleA",
        "titleB",
        "originalKey",
        "bpm",
        "tags",
        "author",
      ],
      tokenize: (text: string) => {
        return text.toLowerCase().match(/[\p{L}\p{N}]+|\p{Script=Han}/gu) || [];
      },
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: {
          titleA: 4,
          titleB: 3,
          tags: 2.5,
          author: 2,
          lyricsA: 1,
          lyricsB: 1,
        },
      },
    });

    ms.addAll(docs);
    return ms;
  }, [docs]);

  // Fetch updated search index if needed on client
  useEffect(() => {
    fetch("/search-index.json")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data: SearchDoc[] | null) => {
        if (data && Array.isArray(data)) {
          setDocs(data);
        }
      })
      .catch(() => {
        // Fallback to initialDocs
      });
  }, []);

  // Filter & search results computation
  const filteredResults = useMemo(() => {
    let resultList: SearchDoc[] = docs;

    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      const searchHits = miniSearch.search(trimmedQuery);
      const docMap = new Map(docs.map((d) => [d.id, d]));
      resultList = searchHits
        .map((h) => docMap.get(h.id))
        .filter((d): d is SearchDoc => d !== undefined);
    }

    if (selectedTag) {
      resultList = resultList.filter((doc) => doc.tags.includes(selectedTag));
    }

    return resultList;
  }, [query, selectedTag, docs, miniSearch]);

  const clearFilters = () => {
    setQuery("");
    setSelectedTag(null);
  };

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋歌名、歌詞關鍵字、作者或分類（例：恩典、Amazing、John Newton）..."
            className="w-full pl-12 pr-12 py-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tag Filtering Chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>標籤分類:</span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
              selectedTag === null
                ? "bg-indigo-600 text-white shadow-sm font-semibold"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            全部 ({docs.length})
          </button>

          {allTags.map(([tag, count]) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(isSelected ? null : tag)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm font-semibold"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{tag}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? "bg-indigo-700 text-indigo-100"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {(query || selectedTag) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-indigo-600 hover:text-indigo-800 ml-2 font-medium underline"
            >
              清除過濾條件
            </button>
          )}
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-900">
            {query || selectedTag
              ? `搜尋結果 (${filteredResults.length})`
              : `詩歌庫總覽 (${filteredResults.length})`}
          </h2>
        </div>
      </div>

      {/* Results Cards Grid */}
      {filteredResults.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResults.map((song) => (
            <a
              key={song.id}
              href={`/songs/${song.id}`}
              className="group p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div>
                  <div className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {song.titleA}
                  </div>
                  {song.titleB && (
                    <div className="text-sm text-slate-400 font-normal">
                      {song.titleB}
                    </div>
                  )}
                </div>

                {song.author && (
                  <div className="text-xs text-slate-500 truncate">
                    作者：{song.author}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {song.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        selectedTag === tag
                          ? "bg-indigo-100 text-indigo-800 font-semibold"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-100 text-xs text-slate-500">
                <div>
                  {song.bpm && (
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">
                      {song.bpm} BPM
                    </span>
                  )}
                  {song.originalKey && (
                    <span className="ml-2 font-mono bg-slate-100 px-2 py-0.5 rounded">
                      {song.originalKey} key
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 font-medium text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                  查看歌詞與和弦 <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700">
            找不到符合條件的詩歌
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            請嘗試使用其他關鍵字、簡化搜尋字詞，或清除分類標籤過濾。
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-semibold hover:bg-indigo-100 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>重設所有過濾條件</span>
          </button>
        </div>
      )}
    </div>
  );
};
