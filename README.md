# Lyrics Library

基於 **Astro + TypeScript + Tailwind CSS** 打造的現代化靜態詩歌歌詞與敬拜管理平台。全站採 **純靜態站點生成 (SSG)** 與 **客戶端零後端 (Zero-Backend)** 架構，兼具極致載入效能、和弦對齊排版、即時調性變換，以及敬拜主領專用的歌單排程工具。

## 1. 核心設計理念與特性

- **單一真實資料來源 (Single Source of Truth)**：

  每首詩歌以單一結構化 JSON 存放，前端自動派生單語、雙語、分段、未分段等多種排列，避免冗餘維護。

- **字元級和弦錨定 (Character-Anchored Chords)**：

  和弦精準綁定於主語言的字元索引（支援超出歌詞長度的句尾小節與間奏標註）。

- **即時升降調與網址雙向同步 (Key Transposition & Two-Way URL Sync)**：

  支援半音即時移調，當前調性即時同步至網址參數（`?key=...`），分享連結即享指定調性。

- **雙軌歌本系統 (Dual-Track Collections)**：
  - **靜態子歌曲庫 (Libraries)**：

    適合長期維護的詩歌選集（如「青年詩歌」、「傳統聖詩」），以 JSON 檔案儲存於 Git。

  - **無狀態活動歌單 (Playlists)**：

    針對單次聚會或主日敬拜，**完全不依賴後端與資料庫**，所有排程、自訂調性、流程與備註直接壓縮編碼於 URL 參數中。

- **維護者專用可視化建構器 (Visual Builders)**：

  內建歌曲庫與歌單生成頁面，支援拖曳排序、一鍵匯出 JSON 提 PR 或產出分享短網址。

- **超輕量檢索**：

  編譯期生成全站輕量搜尋索引（500 首詩歌約 70~100 KB），以 MiniSearch 於前端毫秒級比對。

## 2. 系統架構與頁面路由

```plaintext
[ 資料層 (Git 管理) ]
├── src/content/songs/*.json         # 單曲資料庫 (500+ 首)
└── src/content/libraries/*.json     # 靜態子歌曲庫索引
          │
          ▼ (Astro SSG 建置期預渲染)
[ 靜態頁面 (SSG) ]
├── /                                # 首頁：全文檢索、標籤過濾、熱門歌庫
├── /songs/[id]                      # 單曲頁：四態歌詞、和弦對齊、升降調控制、附件下載
├── /libraries                       # 靜態子歌曲庫總覽
└── /libraries/[id]                  # 特定子歌曲庫聚合瀏覽與整本匯出

[ 客戶端動態工具 (Client-Side Only) ]
├── /playlist                        # 活動歌單檢視頁 (解析 URL Hash 參數即時渲染)
├── /tools/library-builder           # 維護者專用：視覺化挑選曲目 ➜ 匯出 JSON ➜ 提交 PR
└── /tools/playlist-builder          # 敬拜歌單產生器：編排流程/調性/備註 ➜ 產出分享 URL
```

## 3. 資料結構規範 (Data Specification)

### 3.1 調性常數定義 (`src/constants/keys.ts`)

```typescript
export const CHROMATIC_SCALE = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export const KEY_ALIASES: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  Gb: "F#",
  "G#": "Ab",
  "A#": "Bb",
};
```

### 3.2 單曲資料結構 (`src/content/songs/{song-id}.json`)

型態定義：

```typescript
export interface ChordItem {
  index: number; // 綁定於主語言 (a) 的字元索引 (0-based；允許 >= a.length 用於句尾延音)
  chord: string; // 和弦名稱 (例: "G", "Em7", "D/F#")
}

export interface LineItem {
  a: string; // 語言 A (主語言歌詞，必要)
  b?: string; // 語言 B (次語言歌詞，選填)
  chords?: ChordItem[]; // 該行和弦配置清單 (由小到大排序)
}

export interface SongSchema {
  // 歌曲 ID 自動使用檔案名稱（例：`amazing-grace.json` ➜ ID 為 `amazing-grace`）
  meta: {
    languages: {
      a: string; // 語言 A 名稱 (必填，預設: "中文")
      b?: string; // 語言 B 名稱 (選填，預設: "English")
    };
    title: {
      a: string; // 語言 A 歌名 (必填)
      b?: string; // 語言 B 歌名 (選填)
    };
    originalKey?: string; // 原調 (例: "G", "C#m")
    bpm?: number; // 速度
    author?: string; // 詞曲作者 / 版權資訊
    ccli?: string; // CCLI 歌曲編號
    tags: string[]; // 主題分類標籤 (例: ["讚美", "恩典"])
    assets?: Array<{
      type: "sheet" | "ppt" | "audio" | "external";
      name: string; // 資源檔案名稱
      url: string; // 檔案路徑 (/assets/...) 或外部連結
      size?: string; // 檔案大小標記
    }>;
  };
  sections: Array<{
    type: "verse" | "chorus" | "bridge" | "pre-chorus" | "tag" | "outro";
    index?: number; // 段落序號 (例: 1, 2)
    lines: LineItem[];
  }>;
}
```

JSON 範例（`amazing-grace.json`）：

```json
{
  "meta": {
    "languages": { "a": "中文", "b": "English" },
    "title": { "a": "奇異恩典", "b": "Amazing Grace" },
    "originalKey": "G",
    "bpm": 72,
    "tags": ["讚美", "傳統聖詩"],
    "assets": [
      {
        "type": "ppt",
        "name": "投影片 (PPTX)",
        "url": "/assets/ppt/amazing-grace.pptx",
        "size": "1.2 MB"
      },
      {
        "type": "sheet",
        "name": "簡譜 (PDF)",
        "url": "/assets/sheets/amazing-grace.pdf"
      }
    ]
  },
  "sections": [
    {
      "type": "verse",
      "index": 1,
      "lines": [
        {
          "a": "奇異恩典，何等甘甜，",
          "b": "Amazing grace! How sweet the sound",
          "chords": [
            { "index": 0, "chord": "G" },
            { "index": 4, "chord": "C" },
            { "index": 6, "chord": "G" },
            { "index": 12, "chord": "D7" }
          ]
        },
        {
          "a": "我罪已得赦免；",
          "b": "That saved a wretch like me!",
          "chords": [
            { "index": 0, "chord": "G" },
            { "index": 4, "chord": "Em" }
          ]
        }
      ]
    }
  ]
}
```

### 3.3 靜態子歌曲庫結構 (`src/content/libraries/{library-id}.json`)

型態定義與範例

```typescript
export interface LibrarySchema {
  id: string; // 歌曲庫 ID
  meta: {
    title: { a: string; b?: string };
    description?: string;
    tags: string[];
  };
  songIds: string[]; // 依序收錄之歌曲 ID 清單
}
```

```json
{
  "id": "classic-hymns",
  "meta": {
    "title": { "a": "經典傳統聖詩", "b": "Classic Hymns" },
    "description": "主日崇拜常用傳統聖詩集合",
    "tags": ["聖詩", "禮拜"]
  },
  "songIds": ["amazing-grace", "it-is-well", "holy-holy-holy"]
}
```

### 3.4 無狀態活動歌單結構 (`/playlist`)

型態定義與 URL 範例

```typescript
export interface PlaylistPayload {
  t?: string; // 活動/聚會名稱 (例: "2026-08-30 主日敬拜")
  d?: string; // 日期 (例: "2026-08-30")
  s: Array<{
    id: string; // 歌曲 ID
    k?: string; // 自訂使用調性 (例: "A")
    flow?: string[]; // 段落自訂排程 (例: ["V1", "C", "V2", "C", "Tag"])
    note?: string; // 敬拜備註 (例: "開頭鋼琴引導由弱漸強")
  }>;
}
```

- URL 攜帶格式：

```url
https://lyrics.example.com/playlist#data=N4IgJgpgFghgzhASgQwDYFcDOAnA9gOwGMBXCAFwQDsATVAMyhgFsAbAewE4OBGAdgEMA5gHcA1gAcIAQ26c4AB2BwA5mAA2AVwDKUgOYAWaZKmz5igJQA6NaqA
```

## 4. 功能操作與互動機制

### 4.1 四態歌詞檢視與複製矩陣

在單曲頁面提供「語言切換」與「排版模式」二維控制器，即時重新繪製：

- **語言切換**： `主語言 (a)` / `次語言 (b)` / `雙語對照 (a+b)`

- **排版模式**： `分段標記模式 (Segmented)` / `連續流暢模式 (Continuous)`

- **一鍵拷貝工具**：
  - 點擊「複製歌詞」按鈕，立即將當前檢視格式拷貝至剪貼簿。

  - 支援專用格式匯出（如：投影簡報專用分頁格式、歌單通知純文字大綱）。

### 4.2 和弦渲染與字元索引對齊規則

- **字中對齊**： `0 <= index < a.length`，和弦精確顯示於主語言對應文字上方。
- **句尾延音／小節過門**： `index >= a.length`，前端在文字尾端動態補足間隔空白，確保和弦置於歌詞後方。
- **次語言位置**： 次語言 `b` 置於最底層作為對照，不影響和弦與主語言字元的水平對齊座標。

### 4.3 升降調控制與 URL 同步機制

- **載入規則**： 優先讀取 URL 參數 `?key={KeyName}`；若無參數則使用 `meta.originalKey`。
- **互動升降**： 點擊 `♭ -1` / `♯ +1` 按鈕時，依 12 半音環推算和弦與調性名稱。
- **網址更新**： 使用 `history.replaceState` 靜默更新網址，不中斷音訊或觸發整頁重載；回到原調時自動清除 `?key` 參數。

### 4.4 維護者工具 (Visual Builders)

1. 歌曲庫生成器 (`/tools/library-builder`)：
   - 左欄搜尋勾選 500 首詩歌，右欄拖曳調整順序。
   - 輸入歌庫中英名稱與描述，一鍵下載 `{library-id}.json` 供發起 GitHub PR。

2. 活動歌單生成器 (`/tools/playlist-builder`)：
   - 搜尋曲目加入排程，針對個別曲目覆寫指定調性、流程標籤與備註。
   - 序列化並壓縮資料，一鍵複製分享網址、生成 QR Code 或導出通訊軟體通知格式。

## 5. 開發與部署指南

### 5.1 本機開發環境設定

- 環境需求： Node.js `20.x` 或 `22.x` (LTS)、`pnpm` (建議)

```bash
# 1. 安裝相依套件
pnpm install

# 2. 啟動本機開發伺服器 (預設埠位: http://localhost:4321)
pnpm dev

# 3. 執行型態校驗與 Zod Schema 驗證
pnpm astro check

# 4. 編譯純靜態站點產物 (輸出至 dist/ 目錄)
pnpm build

# 5. 預覽打包產物
pnpm preview
```

### 5.2 部署平台配置

本系統為純靜態 HTML/JS/CSS，相容各主流靜態託管服務：

- Cloudflare Pages (建議)：
  - Framework Preset： `Astro`
  - Build Command： `pnpm build`
  - Build Output Directory： `dist`
  - 環境變數：
    - `NODE_VERSION`: `20`

- GitHub Pages：
  - 於 Repository 設定中將 Pages Source 設定為 GitHub Actions。

### 5.3 CI/CD 自動化守門工作流 (`.github/workflows/deploy.yml`)

每次發起 Pull Request 或合併至 `main` 分支時，自動執行資料完整性檢查，杜絕格式錯誤的 JSON 上線：

```yaml
name: CI & Deployment

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-and-build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      # 守門機制：校驗 500+ 首歌曲與歌庫 JSON 是否符合 Schema 規則
      - name: Schema & Type Check
        run: pnpm astro check

      - name: Build Static Site
        run: pnpm build

      - name: Deploy to GitHub Pages
        if: github.ref == 'refs/heads/main'
        uses: actions/deploy-pages@v4
```

## 6. 維護與協作指引 (Contribution Guide)

1. **新增單曲**：
   - 於 `src/content/songs/` 目錄建立 `{song-id}.json`。
   - 欄位必須嚴格符合 `SongSchema`，確認字元和弦 `index` 自 `0` 起算。

2. **新增/更新子歌曲庫**：
   - 前往本機或線上環境的 `/tools/library-builder` 頁面。
   - 勾選並拖曳排序歌曲，點擊「下載 JSON」，將檔案放入 `src/content/libraries/`。

3. **提交與合併**：
   - 透過 Git 推送分支並在 GitHub 建立 Pull Request。
   - GitHub Actions 自動執行 `pnpm astro check` 檢驗資料正確性，通過後即可合併發布。
