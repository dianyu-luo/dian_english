/** 英文单词：至少含一个字母，可含数字、撇号、连字符 */
const ENGLISH_WORD_RE = /[A-Za-z][A-Za-z0-9]*(?:['’-][A-Za-z0-9]+)*/;
const ENGLISH_WORD_FULL_RE = /^[A-Za-z][A-Za-z0-9]*(?:['’-][A-Za-z0-9]+)*$/;

/** 判断文本是否为可入库的英文单词（中文等非英文不算） */
export function isEnglishWord(text: string): boolean {
  return ENGLISH_WORD_FULL_RE.test(text.trim());
}

/** 从当前 Selection 中取出英文单词；无有效英文词时返回 null */
export function getSelectedWord(selection: Selection | null = null): string | null {
  const sel = selection ?? (typeof window !== "undefined" ? window.getSelection() : null);
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const raw = sel.toString().replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const word = raw.match(ENGLISH_WORD_RE);
  return word?.[0] ?? null;
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
  /** 相对页面宽高的比例坐标，方便下次定位（包围盒） */
  rect: PdfWordRect;
  /** 按行拆分的高亮条，多行句子用这个盖住文字而非整块矩形 */
  rects: PdfWordRect[];
  /** 选区像素矩形（相对当前渲染页面，包围盒） */
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

/** 将同一行上的碎片矩形合并成连续高亮条（PDF 文本层常按 span/字符拆分） */
export function mergeLineRects(rects: PdfWordRect[]): PdfWordRect[] {
  if (rects.length <= 1) return rects.map((r) => ({ ...r }));

  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: PdfWordRect[] = [];

  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (!last) {
      lines.push({ ...r });
      continue;
    }

    const lastBottom = last.top + last.height;
    const rBottom = r.top + r.height;
    const overlap = Math.min(lastBottom, rBottom) - Math.max(last.top, r.top);
    const minH = Math.min(last.height, r.height);
    // 垂直重叠超过较短边的一半 → 视为同一行
    if (minH > 0 && overlap / minH >= 0.5) {
      const right = Math.max(last.left + last.width, r.left + r.width);
      const bottom = Math.max(lastBottom, rBottom);
      last.left = Math.min(last.left, r.left);
      last.top = Math.min(last.top, r.top);
      last.width = round4(right - last.left);
      last.height = round4(bottom - last.top);
    } else {
      lines.push({ ...r });
    }
  }

  return lines;
}

function unionRects(rects: PdfWordRect[]): PdfWordRect {
  const first = rects[0]!;
  let left = first.left;
  let top = first.top;
  let right = first.left + first.width;
  let bottom = first.top + first.height;
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i]!;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  return {
    left: round4(left),
    top: round4(top),
    width: round4(right - left),
    height: round4(bottom - top),
  };
}

/** 从 Range 收集按行归一化的高亮矩形 */
export function getSelectionLineRects(
  range: Range,
  pageBox: { left: number; top: number; width: number; height: number },
): { rect: PdfWordRect; rects: PdfWordRect[]; pixelRect: PdfWordRect } {
  const rawClient = Array.from(range.getClientRects()).filter(
    (r) => r.width > 0.5 && r.height > 0.5,
  );

  const clientRects =
    rawClient.length > 0
      ? rawClient
      : (() => {
          const box = range.getBoundingClientRect();
          return box.width > 0 && box.height > 0 ? [box] : [];
        })();

  const normalized = clientRects.map((box) => ({
    left: round4((box.left - pageBox.left) / pageBox.width),
    top: round4((box.top - pageBox.top) / pageBox.height),
    width: round4(box.width / pageBox.width),
    height: round4(box.height / pageBox.height),
  }));

  const rects = mergeLineRects(normalized);
  const rect = rects.length > 0 ? unionRects(rects) : { left: 0, top: 0, width: 0, height: 0 };
  const pixelRect = {
    left: round4(rect.left * pageBox.width),
    top: round4(rect.top * pageBox.height),
    width: round4(rect.width * pageBox.width),
    height: round4(rect.height * pageBox.height),
  };
  return { rect, rects, pixelRect };
}

/** 从已存 locator / 单矩形还原渲染用的按行高亮 */
export function resolveHighlightRects(opts: {
  locator?: string | null;
  rect?: PdfWordRect | null;
}): PdfWordRect[] {
  if (opts.locator) {
    try {
      const loc = JSON.parse(opts.locator) as { rects?: unknown; rect?: PdfWordRect };
      if (Array.isArray(loc.rects) && loc.rects.length > 0) {
        const parsed = loc.rects.filter(
          (r): r is PdfWordRect =>
            !!r &&
            typeof r === "object" &&
            typeof (r as PdfWordRect).left === "number" &&
            typeof (r as PdfWordRect).top === "number" &&
            typeof (r as PdfWordRect).width === "number" &&
            typeof (r as PdfWordRect).height === "number",
        );
        if (parsed.length > 0) return parsed;
      }
      if (loc.rect) return [loc.rect];
    } catch {
      // fall through
    }
  }
  if (opts.rect) return [opts.rect];
  return [];
}

export function buildWordLocator(
  info: Omit<PdfWordSelectInfo, "locator" | "pixelRect" | "raw"> & { raw?: string },
): string {
  return JSON.stringify({
    fileName: info.fileName,
    pageNumber: info.pageNumber,
    word: info.word,
    type: info.type,
    rect: info.rect,
    rects: info.rects,
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

  const { rect, rects, pixelRect } = getSelectionLineRects(range, pageBox);
  if (rects.length === 0 || rect.width <= 0 || rect.height <= 0) return null;

  const { before, after } = getSelectionContext(range, pageEl);
  const base = {
    word,
    raw,
    type,
    pageNumber: options.pageNumber,
    fileName: options.fileName,
    rect,
    rects,
    contextBefore: before,
    contextAfter: after,
  };

  return {
    ...base,
    pixelRect,
    locator: buildWordLocator(base),
  };
}
