import React, { useState, useMemo } from 'react';
import type { SongData } from '@/content/config';
import {
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Copy,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  AlertCircle,
  FileCode,
} from 'lucide-react';

export interface LibraryBuilderProps {
  availableSongs: SongData[];
}

export const LibraryBuilder: React.FC<LibraryBuilderProps> = ({ availableSongs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Form State
  const [libraryId, setLibraryId] = useState('new-library');
  const [titleA, setTitleA] = useState('');
  const [titleB, setTitleB] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('敬拜, 詩歌');
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);

  const [copied, setCopied] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // Map song ID to song data
  const songMap = useMemo(() => {
    return new Map(availableSongs.map((s) => [s.id, s]));
  }, [availableSongs]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    availableSongs.forEach((s) => s.meta.tags.forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [availableSongs]);

  // Filter left column songs
  const filteredCatalog = useMemo(() => {
    return availableSongs.filter((song) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        song.id.toLowerCase().includes(q) ||
        song.meta.title.a.toLowerCase().includes(q) ||
        (song.meta.title.b && song.meta.title.b.toLowerCase().includes(q)) ||
        (song.meta.author && song.meta.author.toLowerCase().includes(q));

      const matchesTag = !selectedTag || song.meta.tags.includes(selectedTag);

      return matchesQuery && matchesTag;
    });
  }, [availableSongs, searchQuery, selectedTag]);

  // Toggle selection
  const toggleSong = (id: string) => {
    if (selectedSongIds.includes(id)) {
      setSelectedSongIds(selectedSongIds.filter((sid) => sid !== id));
    } else {
      setSelectedSongIds([...selectedSongIds, id]);
    }
  };

  // Select all visible
  const selectAllVisible = () => {
    const newIds = new Set(selectedSongIds);
    filteredCatalog.forEach((s) => newIds.add(s.id));
    setSelectedSongIds(Array.from(newIds));
  };

  // Deselect all
  const clearSelection = () => {
    setSelectedSongIds([]);
  };

  // Reorder
  const moveSong = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedSongIds.length) return;
    const nextList = [...selectedSongIds];
    const temp = nextList[index];
    nextList[index] = nextList[newIndex];
    nextList[newIndex] = temp;
    setSelectedSongIds(nextList);
  };

  // Remove single song
  const removeSong = (id: string) => {
    setSelectedSongIds(selectedSongIds.filter((sid) => sid !== id));
  };

  // Build JSON object
  const generatedJson = useMemo(() => {
    const parsedTags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      id: libraryId.trim() || 'my-library',
      meta: {
        title: {
          a: titleA.trim() || '未命名歌庫',
          ...(titleB.trim() ? { b: titleB.trim() } : {}),
        },
        ...(description.trim() ? { description: description.trim() } : {}),
        tags: parsedTags,
      },
      songIds: selectedSongIds,
    };
  }, [libraryId, titleA, titleB, description, tagsInput, selectedSongIds]);

  const jsonString = useMemo(() => {
    return JSON.stringify(generatedJson, null, 2);
  }, [generatedJson]);

  // Validation
  const isValid = Boolean(libraryId.trim() && titleA.trim() && selectedSongIds.length > 0);

  // Copy JSON
  const handleCopyJson = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(jsonString);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = jsonString;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          (document as unknown as { execCommand: (cmd: string) => boolean }).execCommand('copy');
        } catch {
          // ignore
        }
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  // Download JSON file
  const handleDownloadJson = () => {
    const fileName = `${libraryId.trim() || 'library'}.json`;
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner Guide */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>維護者視覺化工具</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            靜態子歌曲庫產生器 (Library Builder)
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            挑選曲目並調整排序，輸入歌庫中英資訊後，一鍵下載符合 Schema 規範的 JSON 檔案，直接放入專案 <code className="text-amber-300 font-mono text-xs">src/content/libraries/</code> 目錄即可發起 GitHub PR！
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCopyJson}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>已複製 JSON</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>複製 JSON</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            disabled={!isValid}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 ${
              isValid
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>下載 {libraryId || 'library'}.json</span>
          </button>
        </div>
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Song Catalog Selector (5 cols on lg) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>挑選曲目庫 ({availableSongs.length})</span>
            </h2>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                選取全部
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-slate-500 hover:text-slate-700"
              >
                清除勾選
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋詩歌歌名、ID 或作者..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                  selectedTag === null
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                全部
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                    selectedTag === tag
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Song list with checkboxes */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredCatalog.map((song) => {
              const isSelected = selectedSongIds.includes(song.id);
              return (
                <div
                  key={song.id}
                  onClick={() => toggleSong(song.id)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'bg-indigo-50/60 border-indigo-200 text-indigo-950'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-indigo-600 flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        {song.meta.title.a}
                      </div>
                      <div className="text-xs text-slate-400">
                        {song.meta.title.b || song.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {song.meta.originalKey && (
                      <span className="font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">
                        {song.meta.originalKey}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Library Metadata & Ordered Selection (6 cols on lg) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Metadata Form */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">歌庫設定與中英資訊</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  歌庫 ID (檔名 / Slug) *
                </label>
                <input
                  type="text"
                  value={libraryId}
                  onChange={(e) => setLibraryId(e.target.value)}
                  placeholder="例: classic-hymns"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  分類標籤 (以逗號分隔)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="例: 聖詩, 禮拜, 青年"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  中文歌庫名稱 (Title A) *
                </label>
                <input
                  type="text"
                  value={titleA}
                  onChange={(e) => setTitleA(e.target.value)}
                  placeholder="例: 經典傳統聖詩"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  英文歌庫名稱 (Title B)
                </label>
                <input
                  type="text"
                  value={titleB}
                  onChange={(e) => setTitleB(e.target.value)}
                  placeholder="例: Classic Hymns"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                歌庫詳細描述 (Description)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例: 主日崇拜常用傳統聖詩集合，適用於各類禮拜排程..."
                rows={2}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
              />
            </div>
          </div>

          {/* Selected Ordered Songs */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  收錄歌曲與排序 ({selectedSongIds.length})
                </h3>
                <p className="text-xs text-slate-400">
                  點擊上下箭頭調整歌庫中曲目的排列先後順序
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowJsonPreview(!showJsonPreview)}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{showJsonPreview ? '隱藏 JSON' : '檢視 JSON'}</span>
              </button>
            </div>

            {selectedSongIds.length > 0 ? (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {selectedSongIds.map((id, index) => {
                  const song = songMap.get(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-mono text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {song ? song.meta.title.a : id}
                          </div>
                          {song && song.meta.title.b && (
                            <div className="text-[11px] text-slate-400">
                              {song.meta.title.b}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSong(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                          title="上移"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => moveSong(index, 'down')}
                          disabled={index === selectedSongIds.length - 1}
                          className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                          title="下移"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeSong(id)}
                          className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors ml-1"
                          title="自歌庫移除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                請由左側勾選歌曲以加入此歌庫
              </div>
            )}

            {/* Validation warnings */}
            {!isValid && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-amber-800 text-xs border border-amber-200/60">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>請確保輸入歌庫 ID、中文歌庫名稱，並至少勾選收錄 1 首歌曲。</span>
              </div>
            )}

            {/* JSON preview */}
            {showJsonPreview && (
              <div className="mt-4 p-4 bg-slate-900 rounded-2xl text-slate-200 font-mono text-xs overflow-x-auto max-h-[300px]">
                <pre>{jsonString}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
