// 文件会话（纯网页版）：打开 / 保存 / 另存、自动保存草稿与未保存保护、存识别项目。

import { saveBytes } from "./fileio";
import { DOC_EXT, acceptAttr } from "../common/filetypes";
import { clearDraft, loadDraft, saveDraft, type Draft } from "./autosave";
import { formatOf, type DocFormatId, type FormatAdapter } from "./formats";
import { describeLosses, planSave } from "../convert/capability";
import { packProject, PROJECT_EXT, type ProjectSnapshot } from "./omrproject";
import { targetSpec, type ConvertTarget } from "../convert/targets";
import { showConfirmDialog } from "./dialogs";
import { t } from "../i18n";
import { targetLabel } from "../i18n/labels";
import type { ScoreDoc } from "../model/doc";

const APP_VERSION = "0.8.7";

/** 文件会话向 App 要的那些能力（**列全**）。 */
export interface FileHost {
  filePath: string | null;
  readonly docFormat: DocFormatId;
  readonly adapter: FormatAdapter;
  readonly omr: { snapshot(): ProjectSnapshot | null };
  getText(): string;
  setStatus(s: string): void;
  importBytes(bytes: Uint8Array, name: string): void;
  openProject(bytes: Uint8Array, name: string, opts?: { draft?: boolean }): Promise<boolean>;
  adoptText(format: DocFormatId, text: string, filePath: string | null): void;
  readonly style: { loadBookSheet(): Promise<void> };
  onDocumentOpened(): Promise<void>;
  /** 当前文档的 `ScoreDoc`（丢失清单要用） */
  scoreDoc(): ScoreDoc | null;
  /** 当前文档 → 目标格式的文本；转不了返回 null */
  convertTo(target: ConvertTarget): string | null;
  documentTitle(): string;
  /** 存到 XML 路径上时写的那份 MusicXML（`export.ts::buildMusicXml`） */
  musicXmlForSave(): Promise<string>;
}

export class FileSession {
  constructor(private host: FileHost) {}

  dispose(): void {
    clearTimeout(this._draftTimer);
    this._draftTimer = undefined;
  }

  /** 记住上次打开/保存的文件路径（纯网页版不可复读本地路径）。 */
  rememberLastFile(_path: string): void {}

  /** 纯网页版无法直接复读磁盘路径，返回 false。 */
  async tryRestoreLastFile(): Promise<boolean> {
    return false;
  }

  async openFile(): Promise<boolean> {
    if (this.isDirty() && !(await this.confirmReplace())) return false;

    return await new Promise<boolean>((resolve) => {
      const input = document.createElement("input");
      let settled = false;
      let changeStarted = false;
      const finish = (opened: boolean) => {
        if (settled) return;
        settled = true;
        resolve(opened);
      };
      input.type = "file";
      input.accept = acceptAttr(DOC_EXT);
      input.onchange = async () => {
        changeStarted = true;
        const file = input.files?.[0];
        if (!file) { finish(false); return; }
        const buf = new Uint8Array(await file.arrayBuffer());
        this.host.importBytes(buf, file.name);
        this.host.filePath = file.name;
        finish(true);
        void this.host.onDocumentOpened();
      };
      window.addEventListener("focus", () => setTimeout(() => {
        if (!changeStarted) finish(false);
      }, 500), { once: true });
      input.click();
    });
  }

  async saveFile(): Promise<void> {
    if (this.host.omr.snapshot()) {
      await this.saveProject(false);
      return;
    }
    await this.saveFileAs();
  }

  async saveFileAs(): Promise<void> {
    const dest = await saveBytes(this.encodeForSave(), this.defaultSaveName());
    this.markClean();
    if (!dest) return;
    this.host.filePath = dest;
    this.rememberLastFile(dest);
  }

  /** 跨格式另存为：**先算会丢什么，列给用户，确认了再写**（`convert/capability.ts`）。 */
  async saveAsFormat(target: ConvertTarget): Promise<void> {
    const doc = this.host.scoreDoc();
    if (doc) {
      const losses = planSave(doc, target);
      if (losses.length) {
        const ok = await showConfirmDialog(t("saveAs.lossTitle"), describeLosses(target, losses));
        if (!ok) return;
      }
    }
    const text = this.host.convertTo(target);
    if (text === null) {
      this.host.setStatus(t("status.saveAsUnsupported", { target }));
      return;
    }
    const adapter = formatOf(targetSpec(target).docFormat);
    const dest = await saveBytes(adapter.encode(text), (this.host.documentTitle() || t("file.untitled")) + adapter.defaultExt);
    if (!dest) return;
    const warn = adapter.encodeWarning?.(text);
    this.host.setStatus(t("status.savedAs", { format: targetLabel(target), ext: adapter.defaultExt }) + (warn ? `；${warn}` : ""));
  }

  // ---------------- 自动保存与崩溃恢复（`autosave.ts`） ----------------
  _cleanText: string | null = null;
  private _draftTimer: ReturnType<typeof setTimeout> | undefined;

  isDirty(): boolean {
    return this.host.getText() !== this._cleanText;
  }

  async confirmReplace(closing = false): Promise<boolean> {
    if (!this.isDirty()) return true;
    return showConfirmDialog(t("unsaved.title"), t(closing ? "unsaved.closeBody" : "unsaved.body"));
  }

  markClean(): void {
    this._cleanText = this.host.getText();
    clearTimeout(this._draftTimer);
    void clearDraft();
  }

  _scheduleDraft(): void {
    clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => {
      const text = this.host.getText();
      if (text === this._cleanText) {
        void clearDraft();
        return;
      }
      const snap = this.host.omr.snapshot();
      void saveDraft({
        time: Date.now(), filePath: this.host.filePath, docFormat: this.host.docFormat, text,
        ...(snap ? { project: packProject(snap, APP_VERSION, true) } : {}),
      });
    }, 3000);
  }

  takeDraft(): Promise<Draft | null> {
    return loadDraft();
  }

  async offerDraftRestore(d: Draft | null): Promise<boolean> {
    if (!d || d.text === this.host.getText()) return false;
    const when = new Date(d.time).toLocaleString();
    const what = d.project ? t("draft.session") : d.filePath ? d.filePath.replace(/^.*[\\/]/, "") : t("draft.untitled");
    const ok = await showConfirmDialog(t("draft.title"), t("draft.body", { what, when }));
    if (!ok) {
      void clearDraft();
      return false;
    }
    if (!d.project || !(await this.host.openProject(d.project, d.filePath ?? "", { draft: true }))) {
      this.host.adoptText(d.docFormat as DocFormatId, d.text, d.filePath);
    }
    this._cleanText = null;
    this._scheduleDraft();
    this.host.setStatus(t("draft.restored"));
    return true;
  }

  // ---------------- 识别项目 `.dolce`（`omrproject.ts`） ----------------
  async saveProject(_asNew: boolean): Promise<boolean> {
    const snap = this.host.omr.snapshot();
    if (!snap) {
      this.host.setStatus(t("proj.nothing"));
      return false;
    }
    const bytes = packProject(snap, APP_VERSION);
    const dest = await saveBytes(bytes, `${this.host.documentTitle() || t("proj.defaultName")}.${PROJECT_EXT}`, "application/zip");
    if (dest) {
      this.host.filePath = dest;
      this.rememberLastFile(dest);
    }
    this.markClean();
    this.host.setStatus(t("proj.saved"));
    return true;
  }

  private defaultSaveName(): string {
    return (this.host.documentTitle() || t("file.untitled")) + this.host.adapter.defaultExt;
  }

  private encodeForSave(): Uint8Array {
    const text = this.host.getText();
    const warn = this.host.adapter.encodeWarning?.(text);
    if (warn) this.host.setStatus(warn);
    return this.host.adapter.encode(text);
  }
}
