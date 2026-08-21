export type PdfJumpRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfJumpSearch = {
  fileName: string | null;
  pageNumber: number | null;
  word: string | null;
  rects: PdfJumpRect[];
};

function compactNum(n: number): string {
  return String(Math.round(n * 1e5) / 1e5);
}

function isValidRect(rect: PdfJumpRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function parseRect(raw: string): PdfJumpRect | null {
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const rect = { left: parts[0]!, top: parts[1]!, width: parts[2]!, height: parts[3]! };
  return isValidRect(rect) ? rect : null;
}

export function buildPdfHref(opts: {
  fileName: string;
  pageNumber?: number;
  word?: string;
  rects?: PdfJumpRect[];
}): string {
  const params = new URLSearchParams();
  params.set("fileName", opts.fileName);
  if (opts.pageNumber != null && Number.isFinite(opts.pageNumber) && opts.pageNumber >= 1) {
    params.set("page", String(Math.floor(opts.pageNumber)));
  }
  const word = opts.word?.trim();
  if (word) params.set("word", word);
  const rects = (opts.rects ?? []).filter(isValidRect);
  if (rects.length > 0) {
    params.set(
      "hl",
      rects.map((r) => [r.left, r.top, r.width, r.height].map(compactNum).join(",")).join("|"),
    );
  }
  return `/pdf?${params.toString()}`;
}

export function parsePdfJumpSearch(search: string | URLSearchParams): PdfJumpSearch {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;

  const fileName = params.get("fileName")?.trim() || null;
  const pageRaw = Number(params.get("page"));
  const pageNumber =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : null;
  const word = params.get("word")?.trim() || null;
  const hl = params.get("hl")?.trim() ?? "";
  const rects = hl
    ? hl.split("|").flatMap((part) => {
        const rect = parseRect(part);
        return rect ? [rect] : [];
      })
    : [];

  return { fileName, pageNumber, word, rects };
}
