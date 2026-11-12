// 說明對話框：五個分頁（功能說明、視覺化編輯、123 格式、記譜法、關於）。純網頁版，無桌面檢查更新或郵件外掛程式。
import { inkOf } from "../common/measure.browser";
import type { App } from "./app";
import { PaintResources, ScorePainter } from "../layout/painter";
import { JpwFile, LayoutSection } from "../jpword/jpwfile";
import { jpwToScoreDoc } from "../model/fromjpw";
import { parse123 } from "../abcfamily/parse";
import type { ScoreDoc } from "../model/doc";
import type { StyleSheet } from "../style/sheet";
import { THEMES, computeStyleForPaper, themeOfMode } from "../style/themes";
import type { MetaData } from "../smufl/smufl";
import { VISUAL_ACTIONS, groupLabel } from "./visual/keys";
import { getLang, t } from "../i18n";
import { openModal } from "./dialogs";
import { FEATURE_TOPICS_EN, GLOSSARY_EN, NOTATION_TEXT_EN, SHORTCUTS_EN, VISUAL_TOPICS_EN } from "./help.en";
import { EXAMPLES_123_TEXT_EN, GLOSSARY_123_EN, INTRO_123_EN } from "./help123.en";
import { EXAMPLES_123, GLOSSARY_123, INTRO_123, SPEC_123_URL, wrap123, type NotationExample } from "./help123";

const APP_VERSION = "0.8.7";
const HOMEPAGE = "https://github.com/lodebar2026/dolce";

// ---- 記譜法範例的算繪 -------------------------------------------------------

export function renderExampleSvg(meta: MetaData, jpwabc: string, opts: ExampleOpts = {}): SVGSVGElement | null {
  let f: JpwFile | null;
  try {
    f = JpwFile.fromString(jpwabc);
  } catch {
    return null;
  }
  if (!f) return null;
  let doc;
  try {
    doc = jpwToScoreDoc(f);
  } catch {
    return null;
  }
  return renderExampleScore(meta, doc, f.getSection(LayoutSection)?.desc ?? null, opts);
}

/** 同上，原始碼是 123（與編輯器裡 123 的簡譜檢視同一條路）。有 error 診斷即不畫。 */
export function render123ExampleSvg(meta: MetaData, text: string, opts: ExampleOpts = {}): SVGSVGElement | null {
  let doc;
  try {
    doc = parse123(text);
    if (doc.diagnostics.some((d) => d.severity === "error")) return null;
  } catch {
    return null;
  }
  return renderExampleScore(meta, doc, null, opts);
}

interface ExampleOpts { width?: number; height?: number; titlePage?: boolean }

let exampleStyle: StyleSheet | null = null;
function exampleStyleSheet(): StyleSheet {
  return (exampleStyle ??= computeStyleForPaper([THEMES[themeOfMode("original")]], { mode: "original", engine: "jianpu" }));
}

function renderExampleScore(
  meta: MetaData,
  doc: ScoreDoc,
  breakDesc: string | null,
  opts: ExampleOpts,
): SVGSVGElement | null {
  const width = opts.width ?? 760;
  const height = opts.height ?? 540;
  const p = new ScorePainter(PaintResources.fixed(meta));
  try {
    p.loadSync({
      view: "original",
      doc,
      breakDesc,
      style: exampleStyleSheet(),
      ink: 0xff1a1a1a,
      page: { w: width, h: height },
      snippet: !opts.titlePage,
    });
    if (p.pageCount === 0) return null;
    return p.renderPage(0);
  } catch {
    return null;
  }
}

// ---- 小工具 ----------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 內聯富文字：把 `**粗**`、`` `程式碼` `` 轉成 span。 */
function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    if (m[1] != null) frag.append(el("strong", undefined, m[1]));
    else if (m[2] != null) frag.append(el("code", "help-code", m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

function para(text: string, cls = "help-p"): HTMLParagraphElement {
  const p = el("p", cls);
  p.append(rich(text));
  return p;
}

// ---- 功能說明 --------------------------------------------------------------

type Badge = "desktop" | "browser" | "mac";
const badgeText = (b: Badge): string => t(`help.badge.${b}`);

interface Topic {
  title: string;
  badges?: Badge[];
  body: string[];
  extra?: () => HTMLElement;
}

const FEATURE_TOPICS_ZH: Topic[] = [
  {
    title: "開啟、儲存與另存新檔",
    body: [
      "從開始畫面點選 **匯入樂譜**，或直接將檔案拖曳進工作區：支援 123（`.123`，簡譜主格式，見「123 格式」分頁）、`.jpwabc`（JP-Word）、jianpu-ly（`.jly`）、文字譜（番茄簡譜 / 詩歌本，`.jps` `.pu` `.fq` `.txt`）、MusicXML（`.xml` / `.musicxml`）、ABC（`.abc`）、Muse（`.jcx`），以及辨識專案 `.dolce`（見「辨識專案」）。",
      "工具列 **另存 / 下載** 可依原格式下載，或轉換為 123、JPWABC、ABC、番茄簡譜、詩歌本文字譜、jianpu-ly、Muse 簡譜（`.jcx`）——跨格式轉換前會先列出目標格式無法保留的內容，確認後再下載；**匯出** 可產生譜面圖（投影檢視出 PPTX，其餘檢視依紙張出 PNG 或 PDF）、MIDI、MusicXML 與 `.jly`。",
      "原始碼區標題列的格式下拉選單可將辨識結果或剛開啟的檔案切換為其他格式編輯，切回「原文」即可還原。",
      "在本機 Song Builder 中編輯的 `.123`、`.abc`、`.musicxml` 內容會自動同步回歌曲表單並隨歌曲 JSON 保存。",
    ],
  },
  {
    title: "編輯與即時排版",
    body: [
      "左側是具語法高亮的原始碼編輯區，**邊打字邊重排**——停頓約 0.2 秒後右側譜面自動更新。",
      "**點選定位**：在譜面上點音符或歌詞，程式碼區會同步捲動定位；也可直接在譜面上修改樂譜，詳見「視覺化編輯」分頁。",
      "MusicXML 沒有文字原始碼區；混排模式與辨識核對檢視時，原始碼區為唯讀或自動隱藏。",
    ],
  },
  {
    title: "翻頁與縮放",
    body: [
      "**翻頁**：底部狀態列「上一頁 / 下一頁」，或鍵盤 `PageUp` / `PageDown`；`Ctrl/⌘+Home` 跳至首頁、`Ctrl/⌘+End` 跳至末頁。",
      "**縮放**：底部狀態列 `−` / `100%` / `＋`，或 `Ctrl/⌘ +` / `-` / `0`，或按住 `Ctrl/⌘` 捲動滾輪。",
      "**並排原圖**時，原圖欄位可單獨縮放（按住 `Ctrl/⌘` 捲動滾輪）、按住滑鼠拖曳平移，雙擊空白處回到符合欄寬。",
      "**欄寬**：原始碼、原圖、排版之間的分隔條可拖曳調整寬度，雙擊分隔條恢復預設寬度；調整結果會記憶於瀏覽器中。",
    ],
  },
  {
    title: "圖片 / PDF 辨識",
    body: [
      "將簡譜**圖片或 PDF**（PNG/JPG/WEBP/PDF）拖進畫面，或點選 **辨識圖片**，系統會在瀏覽器本機離線辨識為可編輯的 123 簡譜（四聲部簡譜會依聲部拆開），圖片不會上傳至伺服器。",
      "**五線譜**亦可辨識：具完整文字層的五線譜 PDF 會直接讀取向量與文字；掃描或拍照的五線譜圖片與 PDF（獨唱譜、合唱譜、簡線混排譜）則透過影像辨識處理，結果進入五線譜 / 混排檢視。",
      "**辨識模式選擇**：預設會檢查前三頁是否含五線譜表自動判斷；開始畫面與工具列的「辨識為」可指定為「簡譜」或「五線譜」，在工具列更改會以上次的原始圖檔重新辨識。一次選取多張圖片（多頁五線譜）會依檔名排序合併為同一首；五線譜辨識時會顯示頁數進度，按 `Esc` 可取消。",
      "辨識完成後，可透過底部狀態列的 **核對** 下拉選單切換各種核對方式：不核對（僅看排版稿）/ 並排原圖 / 原圖片段 / 附近浮窗 / 原位疊加 / 僅原圖——前三種仍在可編輯的排版稿中，後三種進入原圖核對疊加檢視。勾選或取消狀態列的 **原始碼** 可隨時展開或隱藏原始碼區。",
      "**在核對檢視直接修正**：點擊辨識框選取音符（或歌詞字），鍵盤、右鍵選單與記號面板的操作方式與排版稿相同；改完後疊加層立即於原圖位置重繪——改過的音標青色、刪除的畫刪除線變灰、新插入的音標示青色虛框，拍數異常的小節紅框也會即時更新。",
      "**補上漏識的音**（原圖核對檢視）：先選中一個音符，按住 `Alt` 點擊原圖漏掉的位置——五線譜會依點擊高度定音高並沿用選中音符的時值；簡譜則複製選中音符到該位置。選中小節線時 `Alt`+點擊可於該處補上一條小節線。",
      "**系統切分錯誤**（五線譜辨識）：在原圖上對某行譜表的空白處點擊右鍵——**與下一系統合併**、**從此行拆成新系統**、**此行非譜表（忽略）**、**指派此譜表到聲部…**。套用後依新切分重建樂譜而不需重跑辨識。",
      "**可疑項目**（簡譜辨識）：把握度較低的音符與歌詞會在核對檢視中以**黃色虛框**標示。點選底部狀態列的 **N 處可疑**（或按 `F8` / `Shift+F8`，會與拍數異常的小節依譜面順序一併跳轉），左側狀態列會說明可疑原因；修改過後即取消標記。",
      "**原圖頁管理**（工具列「原圖頁」）：可檢視本次辨識輸入的圖片與 PDF，調整順序（支援拖曳或上下鍵）、刪除、加頁，圖片還可順時針旋轉 90° 或裁切邊緣；調整後點 **依這些頁重新辨識** 重跑辨識。勾選開始畫面的 **辨識前先調整原圖** 可於送出前先進行旋轉與裁切。",
    ],
  },
  {
    title: "辨識專案（.dolce）與自動暫存",
    body: [
      "對辨識後的樂譜執行 **另存 / 下載** 可儲存為 **辨識專案** `.dolce` 檔：內含原圖 / 原 PDF、辨識結果與正在編輯的樂譜。日後重新拖入即可直接回到上次的核對檢視，**不必重新辨識**；輸出格式與核對檢視設定也會一併還原。",
      "若只需純樂譜檔，可在「另存 / 下載」中選擇 123 / MusicXML / 文字譜等格式，或直接同步回 Song Builder 的歌曲資料。",
      "**自動暫存**：未儲存的變動於停止輸入約 3 秒後會在本機瀏覽器 IndexedDB 暫存草稿；意外關閉或重新整理後重新開啟時，會詢問是否還原草稿。",
    ],
  },
  {
    title: "匯入 ABC / MusicXML",
    body: [
      "**ABC 記譜**（`.abc`）：原生解析並排版為簡譜，可直接編輯並按原文匯出；支援多聲部、反覆、一二房、和弦、裝飾音與歌詞。",
      "**MusicXML**（`.xml` / `.musicxml`）：單聲部樂譜開啟時可選擇轉為 123 / JPWABC / ABC / 文字譜編輯，或保留 MusicXML 檢視五線譜；多聲部樂譜（如四部合唱）直接進入**混排**檢視。",
    ],
  },
  {
    title: "譜面檢視與斷行方式",
    body: [
      "右側排版區上方提供四種檢視模式：**投影**（反覆與多段歌詞逐遍展開、每遍一頁）、**簡譜**（依原譜排列、多段歌詞疊排）、**五線譜**、**混排**（五線譜上方疊加簡譜）。文字格式亦會自動轉出五線譜與混排檢視。",
      "**斷行方式**：支援「原始排版」、「依樂句重排」（依歌詞與樂句自動換行）與「每行 N 小節」，並可設定每行固定小節數；若紙寬容納不下，狀態列會顯示提示。",
    ],
  },
  {
    title: "試聽播放",
    body: [
      "工具列 **試聽** 按鈕支援播放 / 暫停 / 繼續；旁邊 ■ 按鈕為停止並回到曲首。簡譜、五線譜、混排與原圖核對檢視皆會顯示同步播放游標線。",
      "**進度條**可拖曳定位，時間顯示可點擊切換「已播時間 / 剩餘時間」；播放或暫停時點擊譜面任一音符可從該處繼續播放。",
      "支援依據譜面速度與 **倍速**（×0.5 ～ ×2）調整播放快慢；**循環** 可重複播放目前譜面選取範圍或整首樂曲；**節拍器** 會在每拍提供高低重音提示。",
      "多聲部樂譜可在上方 **聲部** 面板分別調整音量、靜音或獨奏（Solo）。試聽音源隨站內資源離線載入，無須外部網路即可演奏鋼琴音色。",
    ],
  },
  {
    title: "匯出",
    body: [
      "上方工具列 **匯出**：依目前所在的檢視模式產生檔案——**投影檢視** 匯出為 **PPTX**（向量簡報，每頁一張投影片）；**其餘檢視**（簡譜、五線譜 / 混排、核對檢視）若為長圖紙張則匯出 **PNG**，分頁紙張則匯出 **PDF**。另外還提供 **MIDI** 與 **MusicXML** 匯出。",
      "需要轉換文字譜原始碼格式（如另存為 `.123`、`.abc`、`.jly`、`.jcx` 等），請使用 **另存 / 下載**。",
    ],
  },
  {
    title: "聲部（合唱譜與分譜）",
    body: [
      "上方工具列 **聲部** 開啟聲部面板，可設定各聲部的 **名稱 / 簡稱**、**譜號**、**移調樂器**（B♭ / F / E♭ 等，限 MusicXML）、**顯示/隱藏**、試聽 **靜音 / 獨奏 / 音量**、**簡譜擷取聲部** 與 **歌詞來源聲部**。",
      "右側按鈕提供：**↑ ↓** 調整順序、**複製**、**依聲線拆**、**依和弦拆**、**併入上一個** 與 **刪除**；底部支援 **新增聲部** 與 **跨聲部複製歌詞**。",
      "**辨識出的五線譜**：面板下方額外顯示「譜表 ↔ 聲部」指派對應表，可手動修正各系統漏部或錯位，點選 **套用** 即可依新配置重建樂譜。",
    ],
  },
  {
    title: "簡繁轉換",
    body: [
      "上方工具列 **簡繁** 可一鍵轉換整首樂譜的中文字（歌詞、標題、詞曲署名），而保持記譜程式碼原封不動；所有格式皆適用。",
      "提供自動偵測、簡體 → 繁體、繁體 → 簡體；歌詞對位符如 `/` 與 `-` 位置保持不變且不會拆散詞組。轉換結果會寫入復原紀錄，`Ctrl/⌘+Z` 可一步還原。",
    ],
  },
  {
    title: "設定",
    body: [
      "上方工具列 **設定** 分為三頁，僅顯示目前檢視下生效的選項：**版面**（紙張、方向、邊距、比例、每頁行數、字級、顏色等）、**頁眉與樣式**（詩集樣式表 `.ss` 與標題字體設定）、**其他**（介面語言、開啟 MusicXML 預設處理方式、改音時發聲）。",
    ],
  },
  {
    title: "介面語言",
    body: [
      "介面支援 **中文** 與 **English**，可在 **設定 → 其他 → 介面語言** 中隨時切換，切換後立即生效，不影響樂譜原文與歌詞。",
    ],
  },
  {
    title: "鍵盤快速鍵",
    body: [],
    extra: shortcutTable,
  },
];

function localized(zh: Topic[], en: { title: string; body: string[] }[]): Topic[] {
  return getLang() === "en" ? zh.map((tp, i) => ({ ...tp, title: en[i]?.title ?? tp.title, body: en[i]?.body ?? tp.body })) : zh;
}

function localizedExamples(zh: NoteEx[], en: { title: string; body: string[] }[]): NoteEx[] {
  return getLang() === "en" ? zh.map((ex, i) => ({ ...ex, title: en[i]?.title ?? ex.title, body: en[i]?.body ?? ex.body })) : zh;
}

function shortcutTable(): HTMLElement {
  const zhRows: [string, string][] = [
    ["放大 / 縮小", "Ctrl/⌘ +  ·  Ctrl/⌘ -"],
    ["重設縮放 100%", "Ctrl/⌘ 0"],
    ["上一頁 / 下一頁", "PageUp  ·  PageDown"],
    ["首頁 / 末頁", "Ctrl/⌘ Home  ·  Ctrl/⌘ End"],
    ["按 Ctrl/⌘ 滾輪", "以滑鼠指標為中心縮放"],
  ];
  const rows = getLang() === "en" ? SHORTCUTS_EN : zhRows;
  const table = el("table", "help-shortcuts");
  for (const [act, key] of rows) {
    const tr = el("tr");
    tr.append(el("td", undefined, act), el("td", undefined, key));
    table.append(tr);
  }
  return table;
}

function buildFeatureHelp(): HTMLElement {
  const pane = el("div", "help-pane");
  pane.append(para(t("help.featuresIntro"), "help-intro"));
  for (const tp of localized(FEATURE_TOPICS_ZH, FEATURE_TOPICS_EN)) {
    const det = el("details", "help-topic");
    const sum = el("summary");
    sum.append(el("span", "help-topic-title", tp.title));
    for (const b of tp.badges ?? []) sum.append(el("span", "help-badge", badgeText(b)));
    det.append(sum);
    for (const line of tp.body) det.append(para(line));
    if (tp.extra) det.append(tp.extra());
    pane.append(det);
  }
  return pane;
}

// ---- 視覺化編輯 -------------------------------------------------------------

const VISUAL_TOPICS_ZH: Topic[] = [
  {
    title: "兩種模式、兩種游標",
    body: [
      "在譜面上直接修譜：**點擊一下譜面**讓譜面取得鍵盤焦點，右上角顯示目前模式。所有編輯結果皆會寫回左側原始碼。",
      "**編輯模式**（方塊選取框）：框住選中的元素，操作作用於該元素。點擊音符、附點、減時線、增時線、小節線或圓滑線皆可單獨選中——按 `Delete` / `Backspace` 僅刪除該部分。",
      "**插入模式**（豎線游標）：落在兩個元素之間，鍵入操作會於游標處插入新元素。點擊兩個音符之間的空白處即可進入插入模式。",
      "**文字單擊選中、雙擊修改**：點擊歌詞、標題或署名，**單擊**僅選取整個文字框（可按 `Delete` 刪除）；**雙擊**則進入文字修改模式（MusicXML 會就地彈出輸入框，文字格式會將焦點切回對應原始碼位置）。",
      "`Insert` 或 `i` 可從編輯模式切到插入模式（豎線落於選中元素後方），`Esc` 切回編輯模式。",
    ],
  },
  {
    title: "選取與移動",
    body: [
      "`←` / `→` 在音符、增時線、小節線、換行符之間逐個移動；`Shift+←` / `Shift+→` 擴大選區；`Home` / `End` 跳到譜面該行頭尾。",
      "`Ctrl/⌘+←` / `Ctrl/⌘+→` 依小節跳轉；`Alt+G` 輸入小節號快速跳轉。",
      "`Shift` + 點擊：從目前選區延伸選取至點擊的音符。",
      "**雙擊小節內空白**可選取整小節；**從空白處按住拖曳**可拉出框選範圍，鬆開滑鼠後將範圍內的音符與小節線一併選中；譜面有焦點時按 `Ctrl/⌘+A` 選取全曲。",
      "選中音符時，排版區標題列左側會即時顯示所屬聲部、小節拍位、音高與時值。",
    ],
  },
  {
    title: "在五線譜 / 混排上編輯",
    body: [
      "切換至 **五線譜** 或 **混排** 檢視時照樣可直接編輯：點擊符頭（或混排上方的簡譜數字）選取音符，點擊歌詞字、小節線、圓滑線即可選中，所有快速鍵、右鍵選單與記號面板皆通用。",
      "簡譜檔與五線譜檔共用同一份選區與復原紀錄。",
    ],
  },
  {
    title: "小節、反覆與跳轉",
    body: [
      "右鍵選單最下方的 **小節** 子選單（以及記號面板）提供：`Ctrl/⌘+B` 在曲末追加空白小節、`Ctrl/⌘+Shift+B` 在目前小節前插入小節、`Ctrl/⌘+Delete` 刪除選中小節。",
      "**調號… / 拍號… / 速度…** 支援在首小節改寫檔案頭或於曲中插入行內欄位；**重讀音高** 選項可在誤判調號或譜號時，保持符頭或數字位置並重讀音高。",
      "支援小節線樣式（普通、雙線、終止線、反覆開始 `|:`、反覆結束 `:|`）、第一房 / 第二房與 **𝄋 / ⊕ / D.C. / D.S. / Fine**。",
    ],
  },
  {
    title: "和弦與多聲部（MusicXML）",
    body: [
      "**疊加和弦音**：選中一個音按 `Alt+1`–`Alt+7`，在上方疊加對應唱名音。按住 **Alt+點擊** 和弦中的某個符頭可單獨選取該音，按 `Delete` 僅刪除該音。",
      "**聲線輸入**：`Ctrl+Alt+1`–`4` 設定新插入音符所屬的譜表聲線（模式標籤會顯示「聲部2」等），適用於大譜表或雙聲線複調。",
    ],
  },
  {
    title: "編輯 MusicXML",
    body: [
      "開啟 `.musicxml` 或五線譜辨識結果時雖無文字原始碼區，仍可在譜面上進行完整編輯——改音高、改時值、增刪音符、拆併小節、雙擊原地改歌詞與標題（`Tab` / `Enter` 連續跳字填寫），並支援 `Ctrl/⌘+Z` 復原與重做。",
    ],
  },
  {
    title: "修改音符",
    body: [
      "選中音符（編輯模式）後：數字 `1`–`7` 改唱名、`0` 改為休止符；字母 `A`–`G` 依音名改寫；`#`、`Shift+B`、`n` 加減升、降、還原記號；`.` 加減附點。",
      "**升降音高**：`↑` / `↓` 依調內音階升降一級；`Alt+↑` / `Alt+↓` 升降半音；`'` / `,` 或 `Ctrl/⌘+↑` / `Ctrl/⌘+↓` 升降八度。",
      "`_` 時值減半，`=` 時值加倍，`-` 新增增時線；`Alt+Shift+3` 將選中的多個音組成三連音或多連音（再按一次拆回）；`Shift+F` 切換延長記號，`>` 切換重音。",
    ],
  },
  {
    title: "插入與刪除",
    body: [
      "插入模式下鍵入數字 `1`–`7` / `0`（或音名 `A`–`G`）即在游標處插入音符，時值依右上角「目前時值」（可按 `_` / `=` 調整）；`-` 插入增時線，`|` 插入小節線。",
      "`Delete` / `Backspace`：編輯模式刪除選中元素；插入模式向後 / 向前刪除相鄰元素。",
    ],
  },
  {
    title: "歌詞錄入",
    body: [
      "選中一個音按 `Alt+L`（桌面環境亦可按 `Ctrl/⌘+L`），在音符下方開啟輸入框填寫該字。",
      "框內按鍵：`空白鍵` 或 `Tab` 確認並跳至下一個音；`-` 連字號；`_` 一字多音延長；`/` 跳過不填字；`Shift+空白鍵` 回上一個音；`Enter` 換到下一段歌詞；`Esc` 結束錄入。",
      "一次輸入多個中文字後按空白鍵，會自動依字序逐音配字。",
    ],
  },
  {
    title: "和弦名、文字與力度",
    body: [
      "選中一個音按 `Alt+K` 開啟和弦名稱輸入框（`空白鍵` 填完跳至下一音，`Enter` 提交結束，清空提交即移除）。",
      "**文字註記**：`Alt+T` 加入上方說明文字；**力度記號**：`Alt+E` 輸入 `p` `mp` `mf` `f` `ff` `sfz` 等力度。",
    ],
  },
  {
    title: "複製、貼上、重複與移調",
    body: [
      "譜面有焦點時支援 `Ctrl/⌘+C` 複製、`Ctrl/⌘+X` 剪下、`Ctrl/⌘+V` 貼上，支援跨格式（如 123 與 ABC、MusicXML 之間）依唱名貼上。",
      "`R`（編輯模式）：就地重複選取片段一次並選中新片段，適合快速製作重複樂型。",
      "**移調**（右鍵選單 / 記號面板「移調…」）：可選「全曲移調」（變更調號並自動處理轉調）或「僅移所選音符」（依半音移調）。",
    ],
  },
  {
    title: "換行與換頁",
    body: [
      "`Enter` 於選中元素後方換行，`Shift+Enter` 換頁；選中譜面上的 `↵` / `⤓` 符號按 `Delete` 可合併兩行。",
      "123 格式換行時會依對位格數自動將下方 `w:` 歌詞拆為兩段；刪除換行時也會自動合併（若使用 `+:` 續行則會提示於原始碼調整）。",
    ],
  },
  {
    title: "掛在音符上的記號",
    body: [
      "**圓滑線**：選取一段音按 `s` 或 `(` 加上（再按取消）；**延音線**：選中音符按 `t` 連往後方同音高音符。",
      "選中音符後按 `Tab` 可依序切換選取該音符上附掛的所有記號（和弦、力度、延長號、裝飾等），按 `Delete` 僅移除該記號。",
    ],
  },
  {
    title: "拖曳與挪動記號與歌詞（辨識修正）",
    body: [
      "選中力度、文字、和弦名、圓滑線或歌詞字後，可用 `Alt+←` / `Alt+→` 往前後音符挪動（`Shift+Alt+←/→` 僅調圓滑線/漸強漸弱終點），或按住滑鼠直接拖曳至目標音符。",
      "**歌詞對齊修正**：`Alt+→` 會在該字前補一空拍並將整串歌詞順延；`Alt+←` 則將歌詞向前收緊一格，可一鍵修正辨識漏音造成的整段錯位。",
      "**增減一層符槓**：選中符槓群組內任一音按 `Shift+G` 選取整組，再按 `_` / `=` 整組加半 / 減半時值。",
    ],
  },
  {
    title: "格式標記（換行符、換頁符）",
    body: [
      "排版區右上角 **¶** 按鈕（或 `Ctrl/⌘+Shift+M`）切換顯示換行符 `↵` 與換頁符 `⤓`，點擊即可直接選取或刪除。",
    ],
  },
  {
    title: "右鍵選單與記號面板",
    body: [
      "**右鍵點擊**譜面：會依游標所在元素自動選取並彈出可用操作選單。",
      "排版區右上角 **面板** 可切換常駐符號面板，支援以滑鼠點選所有唱名、音高、時值、裝飾、小節線與小節操作。",
    ],
  },
  {
    title: "改音時發聲",
    body: [
      "修改唱名、八度、升降號或插入音符時，會短促播放目前音高的鋼琴提示音方便聽覺校對；可在 **設定 → 其他** 關閉。",
    ],
  },
  {
    title: "小節時值自檢",
    body: [
      "系統會依拍號自動檢查每小節總拍數，異常小節於譜面標示淡紅底與拍差標籤（如 `−♩`、`+♪`），點擊右上角問題計數或按 `F8` / `Shift+F8` 可逐一跳轉檢視。",
      "工具列右上角 **拍** 按鈕可開關此檢查。",
    ],
  },
  {
    title: "復原與重做",
    body: [
      "譜面上的 `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z` 與原始碼區共用同一份復原歷史紀錄。",
    ],
  },
  {
    title: "快速鍵一覽",
    body: ["以下快速鍵在**譜面有焦點**時生效（先點擊一下譜面）。`/` 不綁定，保留給歌詞對位輸入。"],
    extra: visualShortcutTable,
  },
];

function visualShortcutTable(): HTMLElement {
  const table = el("table", "help-shortcuts");
  const groups = new Map<typeof VISUAL_ACTIONS[number]["group"], typeof VISUAL_ACTIONS[number][]>();
  for (const a of VISUAL_ACTIONS) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  for (const [group, actions] of groups) {
    const head = el("tr");
    const th = el("th", undefined, groupLabel(group));
    th.colSpan = 3;
    head.append(th);
    table.append(head);
    for (const a of actions) {
      const tr = el("tr");
      const mode = a.modes ? t(a.modes[0] === "edit" ? "help.modeEdit" : "help.modeInsert") : "";
      const keys = a.web ? t("help.webKeys", { keys: a.keyText, web: a.web.keyText }) : a.keyText;
      tr.append(el("td", undefined, a.label), el("td", undefined, keys), el("td", undefined, a.help + (mode && t("help.onlyMode", { mode }))));
      table.append(tr);
    }
  }
  return table;
}

function buildVisualHelp(): HTMLElement {
  const pane = el("div", "help-pane");
  pane.append(para(t("help.visualIntro"), "help-intro"));
  for (const tp of localized(VISUAL_TOPICS_ZH, VISUAL_TOPICS_EN)) {
    const det = el("details", "help-topic");
    const sum = el("summary");
    sum.append(el("span", "help-topic-title", tp.title));
    det.append(sum);
    for (const line of tp.body) det.append(para(line));
    if (tp.extra) det.append(tp.extra());
    pane.append(det);
  }
  return pane;
}

// ---- 記譜法 ----------------------------------------------------------------

type NoteEx = NotationExample;

function wrapVoice(voice: string, key = "1=C", meter = "4/4"): string {
  return `.Title\nKeyAndMeters = {${key},${meter}}\n.Voice\n${voice}\n`;
}

const GLOSSARY: [string, string][] = [
  ["唱名 1–7", "簡譜用數字 1234567 表示 do re mi fa so la si 七個音，`0` 是休止符（不出聲）。"],
  ["八度點", "音符上方或下方的小圓點，上方一點高八度、下方一點低八度。"],
  ["減時線", "寫在音符**下方**的短橫線，一條把時值減半（八分音符），兩條再減半（十六分音符）。"],
  ["增時線", "音符**右側**的橫線 `-`，每條將時值延長一拍。"],
  ["附點", "音符右側的小圓點 `.`，將時值延長一半（如附點四分音符 = 四分 + 八分）。"],
  ["小節線 / 拍號", "`|` 分隔小節；`拍號` 如 `4/4` 表示每小節四拍、以四分音符為一拍。"],
  ["調號", "如 `1=C` 表示 do 唱作 C，決定整首曲子的音高基準。"],
  ["圓滑線 / 延音線", "音符間的弧線：跨不同音高稱為圓滑線（連奏），跨相同音高稱為延音線（連成一個長音）。"],
];

const NOTATION: NoteEx[] = [
  {
    title: "音符與休止符",
    level: "常用",
    body: [
      "簡譜用數字 **1–7** 表示七個唱名（do re mi fa so la si），**0** 表示**休止符**（該拍不發聲）。",
      "音符之間可以留空白，也可以不留。",
    ],
    code: "1 2 3 4 5 6 7 0",
  },
  {
    title: "高低八度（八度點）",
    level: "常用",
    body: [
      "**八度點**：音符**上方**加一個 `'`（撇號）升高一個八度，**下方**加一個 `,`（逗號）降低一個八度；加兩個就是兩個八度。",
      "在原始碼中寫在數字**後面**：`1'` 是高音 do，`1,` 是低音 do。",
    ],
    code: "1, 1 1' 5, 5 5'",
  },
  {
    title: "升記號與降記號",
    level: "常用",
    body: [
      "在數字**前**加 `#` 升半音、加 `b` 降半音。",
      "例如 `#4` 是升 fa、`b7` 是降 si。",
    ],
    code: "1 #1 2 #2 3 4 #4 5",
  },
  {
    title: "時值：減時線與十六分音符",
    level: "常用",
    body: [
      "**減時線**（音符下方的底線 `_`）將時值減半：一條 `_` 是八分音符，兩條 `__` 是十六分音符。",
      "相鄰的短音符會自動用橫槓相連。",
    ],
    code: "1 2 3_ 3_ 4 5__ 5__ 5__ 5__",
  },
  {
    title: "時值：附點與增時線",
    level: "常用",
    body: [
      "**附點** `.`（音符右側小圓點）把時值延長一半：`5.` 是附點四分音符。常與減時線搭配成 `5. 5_`。",
      "**增時線** `-`（音符右側橫線）每條延長一拍：`5-` 是二分音符、`5---` 是全音符。",
    ],
    code: "5. 5_ 5 5 |1- 1 |1--- |",
  },
  {
    title: "小節線、拍號與調號",
    level: "常用",
    body: [
      "`|` 是**小節線**，分隔小節。曲子的**拍號**和**調號**寫在 `.Title` 段的 `KeyAndMeters` 中，格式 `{聲部號=調,拍號}`，如 `{1=G,3/4}`。",
      "拍號也可於 `.Voice` 中途改變，直接寫入 `3/4` 等記號即可。",
    ],
    code: ".Title\nKeyAndMeters = {1=G,3/4}\n.Voice\n5 1' 1' |6 1' 1' |5 4 3 |2- 0 |",
  },
  {
    title: "反覆記號",
    level: "常用",
    body: [
      "反覆記號讓一段樂句重複演奏：`|:` 是反覆開始、`:|` 是反覆結束，中間的小節會唱兩遍。",
      "`||` 是雙小節線（分句），`|]` 是終止線（曲終）。",
    ],
    code: "1 2 3 4 |: 5 6 7 1' :| 1--- |]",
    render: false,
  },
  {
    title: "演唱順序（.Repeat 段）",
    level: "進階",
    body: [
      "`.Voice` 內的 `|:` `:|` 和一、二房是**譜面記號**；實際決定「按何順序、唱第幾段詞」的是 `.Repeat` 段。",
      "每行一條，格式 `起始小節-結束小節V段號`（小節號從 1 起）。段號後加 `P` 表示**這段唱完換頁**（如 `1-4V1P`）。",
    ],
    code: ".Repeat\n1-4V1\n1-4V2\n5-8V1",
    render:
      ".Title\nKeyAndMeters = {1=C,4/4}\n.Voice\n1 2 3 4 |5 6 7 1' |1' 7 6 5 |4 3 2 1 |$\n" +
      "5 5 5 5 |6 6 6 6 |7 7 7 7 |1'--- |\n.Words\nW1@1,1:\n第一段詞/////////////////\nW2@1,1:\n第二段詞/////////////////\n" +
      ".Repeat\n1-4V1\n1-4V2\n5-8V1\n",
  },
  {
    title: "圓滑線與延音線",
    level: "進階",
    body: [
      "音符之間的弧線：跨**不同**音高是**圓滑線**，跨**相同**音高是**延音線**。",
      "原始碼中使用圓括號 `( ... )` 括住要相連的音符。",
    ],
    code: "(5 6) (1' 1') 3 2 |1--- |",
  },
  {
    title: "延長記號（fermata）",
    level: "進階",
    body: [
      "在音符**前面**寫 `{YanYin}` 加入**延長記號**（fermata，音符上方「◠」），表示此音可自由延長。",
    ],
    code: "5 5 5 5 |{YanYin}1 - - - |]",
  },
  {
    title: "歌詞",
    level: "常用",
    body: [
      "歌詞寫在 `.Words` 段。前綴 `W1@1,1:` 表示第 1 段歌詞、從第 1 小節第 1 個音符起對齊。",
      "每個字**預設對一個音符**；用 `/` 表示此音符**不換字**（一字多音的拖腔）。多段歌詞分別以 `W1` `W2` 書寫。",
    ],
    code: ".Title\nKeyAndMeters = {1=C,4/4}\n.Voice\n1 2 3 4 |5 6 5- |\n.Words\nW1@1,1:\n我 們 歌 唱 主/愛",
    render:
      ".Title\nTitle = {範例}\nKeyAndMeters = {1=C,4/4}\n.Voice\n1 2 3 4 |5 6 5- |\n.Words\nW1@1,1:\n我 們 歌 唱 主/愛\n",
  },
  {
    title: "標題資訊",
    level: "常用",
    body: [
      "`.Title` 段存放曲目標題資訊：`Title` 為標題、`WordsByAndMusicBy` 為詞曲作者（格式 `{詞作者,曲作者}`）；`KeyAndMeters` 設定調號與拍號。",
      "`Expression` 記錄速度與表情：如 `{♩=76}` 表示每分鐘 76 拍，未指定時預設按 ♩=90 試聽。",
    ],
    code: ".Title\nTitle = {奇異恩典}\nKeyAndMeters = {1=G,3/4}\nWordsByAndMusicBy = {John Newton,美國民謠}\n.Voice\n5 1'. 1'_ 3' |2'- 1'- |",
    titlePage: true,
  },
];

function buildNotationHelp(app: App): HTMLElement {
  return buildExamplePane({
    intro: t("help.notationIntro"),
    glossary: getLang() === "en" ? GLOSSARY_EN : GLOSSARY,
    examples: localizedExamples(NOTATION, NOTATION_TEXT_EN),
    render: (ex) => {
      const text = ex.render ?? (ex.code.trimStart().startsWith(".") ? ex.code : wrapVoice(ex.code));
      return renderExampleSvg(app.meta, text, { titlePage: ex.titlePage });
    },
  });
}

function has123Header(code: string): boolean {
  return /^(?:[A-Za-z]|[\u4e00-\u9fff]+)[:：]/.test(code.trimStart());
}

function build123Help(app: App): HTMLElement {
  const pane = buildExamplePane({
    intro: getLang() === "en" ? INTRO_123_EN : INTRO_123,
    glossary: getLang() === "en" ? GLOSSARY_123_EN : GLOSSARY_123,
    examples: localizedExamples(EXAMPLES_123, EXAMPLES_123_TEXT_EN),
    render: (ex) => {
      const text = ex.render ?? (has123Header(ex.code) ? ex.code : wrap123(ex.code));
      return render123ExampleSvg(app.meta, text, { titlePage: ex.titlePage });
    },
  });
  const spec = el("button", "about-link", t("help.spec123"));
  spec.onclick = () => {
    window.open(SPEC_123_URL, "_blank", "noopener");
  };
  pane.querySelector(".help-intro")?.after(spec);
  return pane;
}

function buildExamplePane(o: {
  intro: string;
  glossary: [string, string][];
  examples: NoteEx[];
  render: (ex: NoteEx & { render?: string }) => SVGSVGElement | null;
}): HTMLElement {
  const pane = el("div", "help-pane");
  pane.append(para(o.intro, "help-intro"));

  const gloss = el("details", "help-glossary");
  gloss.append(el("summary", undefined, t("help.glossary")));
  const dl = el("dl", "help-gloss-list");
  for (const [term, desc] of o.glossary) {
    const dt = el("dt");
    dt.append(rich(term));
    dl.append(dt);
    const dd = el("dd");
    dd.append(rich(desc));
    dl.append(dd);
  }
  gloss.append(dl);
  pane.append(gloss);

  for (const ex of o.examples) {
    const sec = el("div", "help-section");
    const head = el("div", "help-sec-head");
    head.append(el("span", "help-sec-title", ex.title));
    const common = ex.level === "常用";
    head.append(el("span", `help-level help-level-${common ? "common" : "adv"}`, t(common ? "help.level.common" : "help.level.adv")));
    sec.append(head);
    for (const line of ex.body) sec.append(para(line));

    const card = el("div", "help-example");
    const pre = el("pre", "help-source");
    pre.textContent = ex.code;
    card.append(pre);

    const svg = ex.render === false ? null : o.render({ ...ex, render: ex.render });
    if (svg) {
      const box = el("div", "help-render");
      svg.classList.add("help-svg");
      box.append(svg);
      card.append(box);
    }
    sec.append(card);
    pane.append(sec);
  }
  return pane;
}

function cropExamples(root: HTMLElement): void {
  const ctx = document.createElement("canvas").getContext("2d");
  for (const svg of Array.from(root.querySelectorAll<SVGSVGElement>("svg.help-svg"))) {
    const bb = inkBox(svg, ctx);
    if (!bb || bb.w <= 0 || bb.h <= 0) continue;
    const pad = 6;
    const vw = bb.w + pad * 2;
    const vh = bb.h + pad * 2;
    svg.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${vw} ${vh}`);
    svg.style.width = `${vw}px`;
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";
    svg.style.aspectRatio = `${vw} / ${vh}`;
  }
}

function inkBox(svg: SVGSVGElement, ctx: CanvasRenderingContext2D | null): { x: number; y: number; w: number; h: number } | null {
  const toSvg = svg.getScreenCTM()?.inverse();
  if (!toSvg) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of Array.from(svg.querySelectorAll<SVGGraphicsElement>("text, path, line, rect, polyline, polygon, circle, ellipse, use, image"))) {
    let b: DOMRect;
    try {
      b = e.getBBox();
    } catch {
      continue;
    }
    let top = b.y, bottom = b.y + b.height;
    if (e instanceof SVGTextElement && ctx && e.textContent) {
      const cs = getComputedStyle(e);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const ink = inkOf(ctx, e.textContent);
      top = ink.top;
      bottom = ink.bottom;
    }
    if (b.width <= 0 && bottom - top <= 0) continue;
    const ctm = e.getScreenCTM();
    if (!ctm) continue;
    const m = toSvg.multiply(ctm);
    for (const [px, py] of [[b.x, top], [b.x + b.width, top], [b.x, bottom], [b.x + b.width, bottom]]) {
      const q = new DOMPoint(px, py).matrixTransform(m);
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
  }
  return x0 < x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// ---- 關於分頁 ----------------------------------------------------------------

function buildAboutPane(): HTMLElement {
  const pane = el("div", "help-pane");
  pane.append(el("div", "about-name", t("about.name")));
  pane.append(el("div", "about-version", t("about.version", { v: APP_VERSION })));

  const home = el("button", "about-link", HOMEPAGE);
  home.onclick = () => {
    window.open(HOMEPAGE, "_blank", "noopener");
  };
  pane.append(labeledRow(t("about.home"), home));
  return pane;
}

function labeledRow(label: string, control: HTMLElement): HTMLElement {
  const row = el("div", "about-row");
  row.append(el("span", "about-label", label), control);
  return row;
}

// ---- 對話框 ----------------------------------------------------------------

export function showHelpDialog(app: App): void {
  const notationPane = buildNotationHelp(app);
  const pane123 = build123Help(app);
  const pages: { label: string; pane: HTMLElement; onFirstShow?: () => void }[] = [
    { label: t("help.tab.features"), pane: buildFeatureHelp() },
    { label: t("help.tab.visual"), pane: buildVisualHelp() },
    { label: t("help.tab.123"), pane: pane123, onFirstShow: () => cropExamples(pane123) },
    { label: t("help.tab.notation"), pane: notationPane, onFirstShow: () => cropExamples(notationPane) },
    { label: t("help.tab.about"), pane: buildAboutPane() },
  ];

  const tabs = el("div", "help-tabs");
  const content = el("div", "help-content");
  const tabBtns = pages.map((pg, i) => {
    const btn = el("button", i === 0 ? "help-tab active" : "help-tab", pg.label);
    pg.pane.style.display = i === 0 ? "" : "none";
    tabs.append(btn);
    content.append(pg.pane);
    return btn;
  });

  const shown = new Set<number>([0]);
  const activate = (idx: number) => {
    pages.forEach((pg, i) => {
      tabBtns[i].classList.toggle("active", i === idx);
      pg.pane.style.display = i === idx ? "" : "none";
    });
    if (!shown.has(idx)) {
      shown.add(idx);
      pages[idx].onFirstShow?.();
    }
    content.scrollTop = 0;
  };
  tabBtns.forEach((btn, i) => (btn.onclick = () => activate(i)));

  const closeBtn = el("button", undefined, t("help.close"));
  const { close } = openModal({ title: t("help.title"), boxClass: "help-box", body: [tabs, content], footer: [closeBtn] });
  closeBtn.onclick = close;
}
