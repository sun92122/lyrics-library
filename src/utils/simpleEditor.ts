import {
  RangeSetBuilder,
  type Extension,
  EditorSelection,
} from "@codemirror/state";
import { undo, redo } from "@codemirror/commands";
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { FLOW_STYLE, FLOW_ALIASES } from "../constants/flow";

const LOWER_TAG_MAP = Object.entries(FLOW_ALIASES).reduce(
  (acc, [key, val]) => {
    acc[key.toLowerCase()] = val;
    return acc;
  },
  {} as Record<string, string>,
);

// 建立 Decoration 快取
const DECO_CACHE: Record<string, Decoration> = {};
for (const [tag, color] of Object.entries(FLOW_STYLE)) {
  DECO_CACHE[tag] = Decoration.mark({
    attributes: { style: `color: ${color}; font-weight: bold;` },
  });
}

export const customHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();

      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const text = line.text;

          // 比對開頭與結尾的空白、#、[、]
          const startMatch = text.match(/^[#\s\[]*/);
          const endMatch = text.match(/[#\s\]]*$/);

          const startOffset = startMatch ? startMatch[0].length : 0;
          const endOffset = endMatch ? endMatch[0].length : 0;

          // 確保排除符號後仍有內容
          if (startOffset + endOffset < text.length) {
            const coreText = text.slice(startOffset, text.length - endOffset);
            const tagKey = LOWER_TAG_MAP[coreText.toLowerCase()];

            if (tagKey && DECO_CACHE[tagKey]) {
              // 選項 A：僅高亮中間的核心標籤（如 Verse 1）
              builder.add(
                line.from + startOffset,
                line.to - endOffset,
                DECO_CACHE[tagKey],
              );

              // 選項 B：若希望整行連同 [ ] 符號一起高亮，改用下方這行：
              // builder.add(line.from, line.to, DECO_CACHE[tagKey]);
            }
          }

          pos = line.to + 1;
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const PRONOUN_MAP: Record<string, string> = {
  他: "祂",
  你: "祢",
};

/**
 * 替換指定代名詞（預設：他➔祂、你➔祢），並同時全選所有已替換的文字
 */
export function replacePronounsAndSelect(
  view: EditorView | null,
  map: Record<string, string> = PRONOUN_MAP,
): boolean {
  if (!view) return false;

  const docText = view.state.doc.toString();
  const keys = Object.keys(map);
  if (keys.length === 0) return false;

  // 動態組合 Regex
  const regex = new RegExp(
    keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "g",
  );
  let match: RegExpExecArray | null;

  const changes = [];
  const ranges = [];
  let cumulativeOffset = 0;

  while ((match = regex.exec(docText)) !== null) {
    const originalText = match[0];
    const replacement = map[originalText];
    if (!replacement) continue;

    const from = match.index;
    const to = from + originalText.length;

    // 1. 記錄變更
    changes.push({ from, to, insert: replacement });

    // 2. 累計偏移量並記錄選取區
    const newFrom = from + cumulativeOffset;
    const newTo = newFrom + replacement.length;
    ranges.push(EditorSelection.range(newFrom, newTo));

    cumulativeOffset += replacement.length - originalText.length;
  }

  if (changes.length === 0) return false;

  // 3. 一併派發變更與多重選取
  view.dispatch({
    changes,
    selection: EditorSelection.create(ranges),
    scrollIntoView: true,
  });

  view.focus();
  return true;
}

export function undoAction(view: EditorView | null): boolean {
  if (!view) return false;
  const success = undo(view);
  if (success) view.focus();
  return success;
}

export function redoAction(view: EditorView | null): boolean {
  if (!view) return false;
  const success = redo(view);
  if (success) view.focus();
  return success;
}
