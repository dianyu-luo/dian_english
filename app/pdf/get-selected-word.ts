/** 从当前 Selection 中取出单词；无有效选区时返回 null */
export function getSelectedWord(selection: Selection | null = null): string | null {
  const sel = selection ?? (typeof window !== "undefined" ? window.getSelection() : null);
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const raw = sel.toString().replace(/\s+/g, " ").trim();
  if (!raw) return null;

  // 多词时取第一个词；中日韩连续字符整段保留
  const cjk = raw.match(/^[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/);
  if (cjk) return cjk[0];

  const word = raw.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/);
  return word?.[0] ?? raw.split(/\s+/)[0] ?? null;
}

/** 相对页面的归一化矩形（0–1），缩放后仍可对齐 */
export type PdfWordRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfWordSelectInfo = {
  word: string;
  raw: string;
  type: "word" | "sentence";
  pageNumber: number;
  fileName: string;
  /** 相对页面宽高的比例坐标，方便下次定位 */
  rect: PdfWordRect;
  /** 选区像素矩形（相对当前渲染页面） */
  pixelRect: { left: number; top: number; width: number; height: number };
  contextBefore: string;
  contextAfter: string;
  /** 可直接存库/本地的定位摘要 */
  locator: string;
};

export type OnPdfWordSelect = (info: PdfWordSelectInfo) => void;

/** 无空白 → 单词；含空白 → 句子 */
export function selectionTypeFromRaw(raw: string): "word" | "sentence" {
  return /\s/.test(raw.trim()) ? "sentence" : "word";
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function findPageElement(node: Node): HTMLElement | null {
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest(".react-pdf__Page") as HTMLElement | null;
}

function getTextLayer(pageEl: HTMLElement): HTMLElement | null {
  return (
    (pageEl.querySelector(".react-pdf__Page__textContent") as HTMLElement | null) ??
    (pageEl.querySelector(".textLayer") as HTMLElement | null)
  );
}

/** 取选区前后文，用于同一页多次出现时区分 */
function getSelectionContext(range: Range, pageEl: HTMLElement, radius = 40) {
  const textLayer = getTextLayer(pageEl);
  const full = (textLayer?.textContent ?? "").replace(/\s+/g, " ").trim();
  const raw = range.toString().replace(/\s+/g, " ").trim();
  if (!full || !raw) return { before: "", after: "" };

  // 用 Range 起止在 textLayer 中的字符偏移，避免 indexOf 撞到第一次出现
  const preRange = document.createRange();
  try {
    preRange.selectNodeContents(textLayer!);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().replace(/\s+/g, " ").trimEnd().length;
    const before = full.slice(Math.max(0, start - radius), start);
    const after = full.slice(start + raw.length, start + raw.length + radius);
    return { before, after };
  } catch {
    const idx = full.indexOf(raw);
    if (idx < 0) return { before: "", after: "" };
    return {
      before: full.slice(Math.max(0, idx - radius), idx),
      after: full.slice(idx + raw.length, idx + raw.length + radius),
    };
  }
}

export function buildWordLocator(info: Omit<PdfWordSelectInfo, "locator" | "pixelRect" | "raw"> & { raw?: string }): string {
  return JSON.stringify({
    fileName: info.fileName,
    pageNumber: info.pageNumber,
    word: info.word,
    type: info.type,
    rect: info.rect,
    contextBefore: info.contextBefore,
    contextAfter: info.contextAfter,
  });
}

/** 从 Selection 收集可复用的单词位置信息 */
export function getSelectedWordInfo(options: {
  selection?: Selection | null;
  pageNumber: number;
  fileName: string;
}): PdfWordSelectInfo | null {
  const sel =
    options.selection ?? (typeof window !== "undefined" ? window.getSelection() : null);
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const raw = sel.toString().replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const type = selectionTypeFromRaw(raw);
  const word = type === "word" ? getSelectedWord(sel) ?? raw : raw;
  if (!word) return null;

  const range = sel.getRangeAt(0);
  const pageEl = findPageElement(range.commonAncestorContainer);
  if (!pageEl) return null;

  const pageBox = pageEl.getBoundingClientRect();
  if (pageBox.width <= 0 || pageBox.height <= 0) return null;

  const box = range.getBoundingClientRect();
  const pixelRect = {
    left: round4(box.left - pageBox.left),
    top: round4(box.top - pageBox.top),
    width: round4(box.width),
    height: round4(box.height),
  };
  const rect: PdfWordRect = {
    left: round4(pixelRect.left / pageBox.width),
    top: round4(pixelRect.top / pageBox.height),
    width: round4(pixelRect.width / pageBox.width),
    height: round4(pixelRect.height / pageBox.height),
  };

  const { before, after } = getSelectionContext(range, pageEl);
  const base = {
    word,
    raw,
    type,
    pageNumber: options.pageNumber,
    fileName: options.fileName,
    rect,
    contextBefore: before,
    contextAfter: after,
  };

  return {
    ...base,
    pixelRect,
    locator: buildWordLocator(base),
  };
}
