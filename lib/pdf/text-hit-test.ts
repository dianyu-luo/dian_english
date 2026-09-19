import type { PDFPageProxy } from "pdfjs-dist";

export type PdfNormRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfTextHit = {
  word: string;
  rects: PdfNormRect[];
  contextBefore: string;
  contextAfter: string;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height?: number;
};

type PdfTextContent = {
  items: Array<PdfTextItem | { type?: string }>;
};

const ENGLISH_WORD_RE = /[A-Za-z][A-Za-z0-9]*(?:['’-][A-Za-z0-9]+)*/g;
const FONT_ASCENT_RATIO = 0.8;
const textCache = new WeakMap<PDFPageProxy, Promise<PdfTextContent>>();

/** Times-Roman 近似字宽（1000 = 1em），用来在整行 item 里按比例切词 */
const CHAR_UNIT: Record<string, number> = {
  " ": 250,
  "!": 333,
  '"': 408,
  "'": 180,
  "(": 333,
  ")": 333,
  ",": 250,
  "-": 333,
  ".": 250,
  "/": 278,
  ":": 278,
  ";": 278,
  "?": 444,
  A: 722,
  B: 667,
  C: 667,
  D: 722,
  E: 611,
  F: 556,
  G: 722,
  H: 722,
  I: 333,
  J: 389,
  K: 722,
  L: 611,
  M: 889,
  N: 722,
  O: 722,
  P: 556,
  Q: 722,
  R: 667,
  S: 556,
  T: 611,
  U: 722,
  V: 722,
  W: 944,
  X: 722,
  Y: 722,
  Z: 611,
  a: 444,
  b: 500,
  c: 444,
  d: 500,
  e: 444,
  f: 333,
  g: 500,
  h: 500,
  i: 278,
  j: 278,
  k: 500,
  l: 278,
  m: 778,
  n: 500,
  o: 500,
  p: 500,
  q: 500,
  r: 333,
  s: 389,
  t: 278,
  u: 500,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
  "0": 500,
  "1": 500,
  "2": 500,
  "3": 500,
  "4": 500,
  "5": 500,
  "6": 500,
  "7": 500,
  "8": 500,
  "9": 500,
};

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function transformMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!,
  ];
}

function isTextItem(item: PdfTextItem | { type?: string }): item is PdfTextItem {
  return "str" in item;
}

function charUnit(ch: string): number {
  return CHAR_UNIT[ch] ?? 500;
}

function prefixWidth(text: string, end: number): number {
  let sum = 0;
  for (let i = 0; i < end && i < text.length; i++) sum += charUnit(text[i]!);
  return sum;
}

function totalWidth(text: string): number {
  return prefixWidth(text, text.length);
}

function itemNormRect(
  item: PdfTextItem,
  rawDims: { pageWidth: number; pageHeight: number; pageX: number; pageY: number },
): PdfNormRect | null {
  if (!item.str) return null;
  const { pageWidth, pageHeight, pageX, pageY } = rawDims;
  if (pageWidth <= 0 || pageHeight <= 0) return null;

  const layerTransform = [1, 0, 0, -1, -pageX, pageY + pageHeight];
  const tx = transformMatrix(layerTransform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  if (fontHeight <= 0) return null;

  const left = tx[4];
  const top = tx[5] - fontHeight * FONT_ASCENT_RATIO;
  const width = Math.max(item.width, fontHeight * 0.2);

  return {
    left: round4(left / pageWidth),
    top: round4(top / pageHeight),
    width: round4(width / pageWidth),
    height: round4(fontHeight / pageHeight),
  };
}

function pointInRect(nx: number, ny: number, rect: PdfNormRect, padX = 0.003, padY = 0.004): boolean {
  return (
    nx >= rect.left - padX &&
    nx <= rect.left + rect.width + padX &&
    ny >= rect.top - padY &&
    ny <= rect.top + rect.height + padY
  );
}

function rectDistance(nx: number, ny: number, rect: PdfNormRect): number {
  const cx = Math.min(Math.max(nx, rect.left), rect.left + rect.width);
  const cy = Math.min(Math.max(ny, rect.top), rect.top + rect.height);
  const dx = nx - cx;
  const dy = ny - cy;
  return dx * dx + dy * dy * 4;
}

function sameLine(a: PdfNormRect, b: PdfNormRect): boolean {
  const aMid = a.top + a.height / 2;
  const bMid = b.top + b.height / 2;
  const minH = Math.min(a.height, b.height);
  return Math.abs(aMid - bMid) <= minH * 0.55;
}

function gapTooLarge(a: PdfNormRect, b: PdfNormRect, lineH: number): boolean {
  const gap = b.left - (a.left + a.width);
  return gap > lineH * 0.45;
}

function sliceRect(rect: PdfNormRect, text: string, start: number, end: number): PdfNormRect {
  const total = totalWidth(text) || 1;
  const from = prefixWidth(text, start) / total;
  const to = prefixWidth(text, end) / total;
  return {
    left: round4(rect.left + rect.width * from),
    top: rect.top,
    width: round4(Math.max(rect.width * (to - from), 0.002)),
    height: rect.height,
  };
}

function expandWordFromItems(
  items: Array<{ item: PdfTextItem; rect: PdfNormRect }>,
  hitIndex: number,
  clickX: number,
): PdfTextHit | null {
  const hit = items[hitIndex];
  if (!hit) return null;

  let start = hitIndex;
  let end = hitIndex;
  const lineH = Math.max(hit.rect.height, 0.008);

  while (start > 0 && sameLine(items[start - 1]!.rect, hit.rect)) {
    if (gapTooLarge(items[start - 1]!.rect, items[start]!.rect, lineH)) break;
    start -= 1;
  }
  while (end < items.length - 1 && sameLine(items[end + 1]!.rect, hit.rect)) {
    if (gapTooLarge(items[end]!.rect, items[end + 1]!.rect, lineH)) break;
    end += 1;
  }

  const pieces = items.slice(start, end + 1);
  const combined = pieces.map((entry) => entry.item.str).join("");
  const matches = [...combined.matchAll(ENGLISH_WORD_RE)];
  if (matches.length === 0) return null;

  type Located = { match: RegExpMatchArray; left: number; right: number; rects: PdfNormRect[] };
  const located: Located[] = [];

  for (const match of matches) {
    const idx = match.index ?? 0;
    const wordEnd = idx + match[0].length;
    const wordRects: PdfNormRect[] = [];
    let left = Infinity;
    let right = -Infinity;
    let offset = 0;
    for (const piece of pieces) {
      const part = piece.item.str;
      const partStart = offset;
      const partEnd = offset + part.length;
      if (wordEnd > partStart && idx < partEnd) {
        const localStart = Math.max(0, idx - partStart);
        const localEnd = Math.min(part.length, wordEnd - partStart);
        const sliced = sliceRect(piece.rect, part, localStart, localEnd);
        wordRects.push(sliced);
        left = Math.min(left, sliced.left);
        right = Math.max(right, sliced.left + sliced.width);
      }
      offset = partEnd;
    }
    if (wordRects.length === 0 || !Number.isFinite(left)) continue;
    located.push({ match, left, right, rects: wordRects });
  }

  if (located.length === 0) return null;

  let chosen = located[0]!;
  let best = Infinity;
  for (const entry of located) {
    const cx = (entry.left + entry.right) / 2;
    const dist =
      clickX < entry.left
        ? entry.left - clickX
        : clickX > entry.right
          ? clickX - entry.right
          : 0;
    const score = dist + Math.abs(clickX - cx) * 0.01;
    if (score < best) {
      best = score;
      chosen = entry;
    }
  }

  const wordStart = chosen.match.index ?? 0;
  const fullText = items.map((entry) => entry.item.str).join("");
  const absoluteStart =
    items.slice(0, start).reduce((sum, entry) => sum + entry.item.str.length, 0) + wordStart;

  return {
    word: chosen.match[0],
    rects: chosen.rects,
    contextBefore: fullText.slice(Math.max(0, absoluteStart - 40), absoluteStart),
    contextAfter: fullText.slice(
      absoluteStart + chosen.match[0].length,
      absoluteStart + chosen.match[0].length + 40,
    ),
  };
}

function layoutItems(
  text: PdfTextContent,
  rawDims: { pageWidth: number; pageHeight: number; pageX: number; pageY: number },
) {
  const entries: Array<{ item: PdfTextItem; rect: PdfNormRect }> = [];
  for (const raw of text.items) {
    if (!isTextItem(raw)) continue;
    const rect = itemNormRect(raw, rawDims);
    if (!rect) continue;
    entries.push({ item: raw, rect });
  }
  return entries;
}

function loadTextContent(page: PDFPageProxy): Promise<PdfTextContent> {
  const cached = textCache.get(page);
  if (cached) return cached;
  const pending = page.getTextContent() as Promise<PdfTextContent>;
  textCache.set(page, pending);
  return pending;
}

/** 用 PDF 文本坐标（与 canvas 一致）查找点击处的英文单词 */
export async function findWordAtPagePoint(options: {
  page: PDFPageProxy;
  clickX: number;
  clickY: number;
}): Promise<PdfTextHit | null> {
  const { page, clickX, clickY } = options;
  if (clickX < 0 || clickX > 1 || clickY < 0 || clickY > 1) return null;

  const viewport = page.getViewport({ scale: 1 });
  const rawDims = viewport.rawDims as {
    pageWidth: number;
    pageHeight: number;
    pageX: number;
    pageY: number;
  };
  const text = await loadTextContent(page);
  const items = layoutItems(text, rawDims);
  if (items.length === 0) return null;

  let hitIndex = -1;
  for (let i = 0; i < items.length; i++) {
    if (pointInRect(clickX, clickY, items[i]!.rect)) {
      hitIndex = i;
      break;
    }
  }

  if (hitIndex < 0) {
    let best = Infinity;
    for (let i = 0; i < items.length; i++) {
      const dist = rectDistance(clickX, clickY, items[i]!.rect);
      if (dist < best) {
        best = dist;
        hitIndex = i;
      }
    }
    const nearest = items[hitIndex];
    if (!nearest || rectDistance(clickX, clickY, nearest.rect) > 0.018) return null;
  }

  return expandWordFromItems(items, hitIndex, clickX);
}
