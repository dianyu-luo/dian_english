import { resolveHighlightRects } from "../../app/pdf/get-selected-word";
import { buildPdfHref } from "../pdf/jump-search";

export type RecentEditKind = "note" | "mark" | "annotation";

export type RecentEditItem = {
  key: string;
  kind: RecentEditKind;
  kindLabel: string;
  type: string;
  typeLabel: string;
  title: string;
  fileName: string;
  pageNumber: number;
  updatedAt: Date;
  href: string;
};

export type RecentEditColor =
  | "word"
  | "question"
  | "note"
  | "bookmark"
  | "todo"
  | "annotation";

export type WordMarkEditRow = {
  id: number;
  fileName: string;
  word: string;
  type: string;
  note: string;
  pageNumber: number;
  rectLeft?: number;
  rectTop?: number;
  rectWidth?: number;
  rectHeight?: number;
  locator?: string | null;
  updatedAt: Date | number | string;
};

export type PinEditRow = {
  id: number;
  fileName: string;
  type: string;
  content: string;
  pageNumber: number;
  rectLeft?: number;
  rectTop?: number;
  rectWidth?: number;
  rectHeight?: number;
  deletedAt?: Date | number | string | null;
  updatedAt: Date | number | string;
};

export type AnnotationEditRow = {
  id: number;
  fileName: string;
  type: string;
  pageNumber: number;
  updatedAt: Date | number | string;
};

const KIND_LABEL: Record<RecentEditKind, string> = {
  note: "笔记",
  mark: "标记",
  annotation: "批注",
};

export function previewText(text: string, max = 40): string {
  const t = text.replace(/^#+\s+/gm, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function wordMarkTypeLabel(type: string): string {
  return type === "sentence" ? "句子" : "单词";
}

export function pinTypeLabel(type: string): string {
  switch (type) {
    case "question":
      return "问题";
    case "bookmark":
      return "书签";
    case "todo":
      return "待办";
    default:
      return "笔记";
  }
}

export function annotationTypeLabel(type: string): string {
  switch (type) {
    case "circle":
      return "圆形";
    case "rect":
      return "矩形";
    default:
      return "箭头";
  }
}

export function recentEditColor(
  item: Pick<RecentEditItem, "kind" | "type">,
): RecentEditColor {
  if (item.kind === "note") return "word";
  if (item.kind === "annotation") return "annotation";
  if (item.type === "question" || item.type === "bookmark" || item.type === "todo") {
    return item.type;
  }
  return "note";
}

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowRect(row: {
  rectLeft?: number;
  rectTop?: number;
  rectWidth?: number;
  rectHeight?: number;
}) {
  if (
    ![row.rectLeft, row.rectTop, row.rectWidth, row.rectHeight].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  ) {
    return null;
  }
  return {
    left: row.rectLeft!,
    top: row.rectTop!,
    width: row.rectWidth!,
    height: row.rectHeight!,
  };
}

export function fromWordMark(row: WordMarkEditRow): RecentEditItem {
  const typeLabel = wordMarkTypeLabel(row.type);
  const note = previewText(row.note);
  const word = previewText(row.word);
  const rects = resolveHighlightRects({ locator: row.locator, rect: rowRect(row) });
  return {
    key: `note-${row.id}`,
    kind: "note",
    kindLabel: KIND_LABEL.note,
    type: row.type,
    typeLabel,
    title: row.type === "sentence" ? word || note || typeLabel : note || word || typeLabel,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    updatedAt: toDate(row.updatedAt),
    href: buildPdfHref({
      fileName: row.fileName,
      pageNumber: row.pageNumber,
      word: row.word.trim() || undefined,
      rects,
    }),
  };
}

export function fromPin(row: PinEditRow): RecentEditItem | null {
  if (row.deletedAt != null) return null;
  const typeLabel = pinTypeLabel(row.type);
  const rect = rowRect(row);
  return {
    key: `mark-${row.id}`,
    kind: "mark",
    kindLabel: KIND_LABEL.mark,
    type: row.type,
    typeLabel,
    title: previewText(row.content) || typeLabel,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    updatedAt: toDate(row.updatedAt),
    href: buildPdfHref({
      fileName: row.fileName,
      pageNumber: row.pageNumber,
      rects: rect ? [rect] : undefined,
    }),
  };
}

export function fromAnnotation(row: AnnotationEditRow): RecentEditItem {
  const typeLabel = annotationTypeLabel(row.type);
  return {
    key: `annotation-${row.id}`,
    kind: "annotation",
    kindLabel: KIND_LABEL.annotation,
    type: row.type,
    typeLabel,
    title: typeLabel,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    updatedAt: toDate(row.updatedAt),
    href: buildPdfHref({ fileName: row.fileName }),
  };
}

export function mergeRecentEdits(
  notes: WordMarkEditRow[],
  marks: PinEditRow[],
  annotations: AnnotationEditRow[],
  limit: number,
): RecentEditItem[] {
  const cap = Math.min(Math.max(1, limit), 50);
  const items: RecentEditItem[] = [
    ...notes.map(fromWordMark),
    ...marks.flatMap((row) => {
      const item = fromPin(row);
      return item ? [item] : [];
    }),
    ...annotations.map(fromAnnotation),
  ];

  items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return items.slice(0, cap);
}
