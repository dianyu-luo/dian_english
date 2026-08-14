"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getSelectedWordInfo, type OnPdfWordSelect } from "./get-selected-word";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PdfSource = File | string | null;

type RecentItem = {
  fileName: string;
  pageNumber: number;
  url: string;
};

export type PdfHighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** 点击标记后跳转目标 */
export type PdfJumpRequest = {
  nonce: number;
  fileName: string;
  pageNumber: number;
  word: string;
  rect: PdfHighlightRect;
};

type PdfViewerProps = {
  onWordSelect?: OnPdfWordSelect;
  onRecentChange?: (item: RecentItem | null) => void;
  jumpRequest?: PdfJumpRequest | null;
};

type PdfPin = {
  id: number;
  fileName: string;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  content: string;
};

type PinKind = "question" | "note";

type ContextMenuState = {
  x: number;
  y: number;
  pageNumber: number;
  rect: PdfHighlightRect;
};

type PdfAnnotation = {
  id: number;
  fileName: string;
  pageNumber: number;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
};

type MarkerMenuState =
  | { x: number; y: number; kind: "question"; pin: PdfPin }
  | { x: number; y: number; kind: "note"; pin: PdfPin }
  | { x: number; y: number; kind: "arrow"; annotation: PdfAnnotation };

type DrawTool = "arrow" | null;

type AnnotateToolId = "arrow" | "circle" | "rect";

type NormPoint = { x: number; y: number };

const QUESTION_MARKER_PX = 28;
const PIN_API: Record<PinKind, string> = {
  question: "/api/pdf/questions",
  note: "/api/pdf/notes",
};
const ARROW_COLOR = "#dc2626";
const ARROW_STROKE_WIDTH = 2.5;
const MIN_ARROW_DRAG_PX = 6;
const LAST_ANNOTATE_TOOL_KEY = "pdf-last-annotate-tool";

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function readLastAnnotateTool(): AnnotateToolId | null {
  try {
    const value = localStorage.getItem(LAST_ANNOTATE_TOOL_KEY);
    if (value === "arrow" || value === "circle" || value === "rect") return value;
  } catch {
    // ignore
  }
  return null;
}

function writeLastAnnotateTool(tool: AnnotateToolId) {
  try {
    localStorage.setItem(LAST_ANNOTATE_TOOL_KEY, tool);
  } catch {
    // ignore
  }
}

function AnnotateArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 14.5 14.5 3.5M14.5 3.5H7.5M14.5 3.5V10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnnotateCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function AnnotateRectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="4.5"
        width="11"
        height="9"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function NoteMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 1.75h7.25L13 4.5v9.75H3V1.75Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M10.25 1.75V4.5H13" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path
        d="M5.25 7h5.5M5.25 9.5h5.5M5.25 12h3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowMarkup({
  x1,
  y1,
  x2,
  y2,
  color,
  strokeWidth,
  markerId,
  selected = false,
  interactive = false,
  onSelect,
  onMenu,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  markerId: string;
  selected?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
  onMenu?: (e: MouseEvent) => void;
}) {
  const x1p = `${x1 * 100}%`;
  const y1p = `${y1 * 100}%`;
  const x2p = `${x2 * 100}%`;
  const y2p = `${y2 * 100}%`;

  return (
    <g>
      {interactive ? (
        <line
          x1={x1p}
          y1={y1p}
          x2={x2p}
          y2={y2p}
          stroke="transparent"
          strokeWidth={Math.max(14, strokeWidth + 10)}
          strokeLinecap="round"
          className="cursor-pointer"
          data-arrow-hit=""
          style={{ pointerEvents: "stroke" }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect?.();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect?.();
            onMenu?.(e);
          }}
        />
      ) : null}
      {selected ? (
        <line
          x1={x1p}
          y1={y1p}
          x2={x2p}
          y2={y2p}
          stroke="#fecaca"
          strokeWidth={strokeWidth + 5}
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      ) : null}
      <line
        x1={x1p}
        y1={y1p}
        x2={x2p}
        y2={y2p}
        stroke={selected ? "#b91c1c" : color}
        strokeWidth={selected ? strokeWidth + 0.5 : strokeWidth}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

async function saveRecentPage(fileName: string, pageNumber: number) {
  await fetch("/api/pdf/recent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, pageNumber }),
  });
}

async function fetchRecentByFileName(fileName: string): Promise<RecentItem | null> {
  const res = await fetch(`/api/pdf/recent?fileName=${encodeURIComponent(fileName)}`);
  const data = await res.json();
  if (!res.ok || !data.ok || !data.item) return null;
  return data.item as RecentItem;
}

export default function PdfViewer({
  onWordSelect,
  onRecentChange,
  jumpRequest,
}: PdfViewerProps) {
  const [file, setFile] = useState<PdfSource>(null);
  const [fileName, setFileName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [booting, setBooting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [highlight, setHighlight] = useState<
    (PdfHighlightRect & { word: string; pageNumber: number }) | null
  >(null);
  const [pageInput, setPageInput] = useState("1");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [annotateSubmenuOpen, setAnnotateSubmenuOpen] = useState(false);
  const [lastAnnotateTool, setLastAnnotateTool] = useState<AnnotateToolId | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenuState | null>(null);
  const [questions, setQuestions] = useState<PdfPin[]>([]);
  const [notes, setNotes] = useState<PdfPin[]>([]);
  const [activePin, setActivePin] = useState<{ kind: PinKind; id: number } | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [draggingPin, setDraggingPin] = useState<{ kind: PinKind; id: number } | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [draftArrow, setDraftArrow] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const markerMenuRef = useRef<HTMLDivElement>(null);
  const pinEditorRef = useRef<HTMLDivElement>(null);
  const pageFrameRef = useRef<HTMLDivElement>(null);
  const arrowStrokeRef = useRef<{
    x1: number;
    y1: number;
    pointerId: number;
  } | null>(null);
  const pinDragRef = useRef<{
    kind: PinKind;
    id: number;
    startClientX: number;
    startClientY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
    currentLeft: number;
    currentTop: number;
    moved: boolean;
  } | null>(null);
  const onWordSelectRef = useRef(onWordSelect);
  const onRecentChangeRef = useRef(onRecentChange);
  const pageNumberRef = useRef(pageNumber);
  const numPagesRef = useRef(numPages);
  const fileNameRef = useRef(fileName);
  const restorePageRef = useRef<number | null>(null);
  const skipPersistRef = useRef(true);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLastAnnotateTool(readLastAnnotateTool());
  }, []);

  const centerHighlight = useCallback(() => {
    const el = highlightRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, []);

  useEffect(() => {
    onWordSelectRef.current = onWordSelect;
  }, [onWordSelect]);

  useEffect(() => {
    onRecentChangeRef.current = onRecentChange;
  }, [onRecentChange]);

  useEffect(() => {
    pageNumberRef.current = pageNumber;
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);

  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setContainerWidth(el.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showHighlight = useCallback(
    (rect: PdfHighlightRect, word: string, page: number) => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      setHighlight({ ...rect, word, pageNumber: page });
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlight(null);
        highlightTimerRef.current = null;
      }, 3500);
    },
    [],
  );

  // 进入页面：恢复最近阅读的文件与页码
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/pdf/recent");
        const data = await res.json();
        if (!res.ok || !data.ok || !data.item || cancelled) {
          onRecentChangeRef.current?.(null);
          return;
        }

        const item = data.item as RecentItem;
        restorePageRef.current = item.pageNumber;
        skipPersistRef.current = true;
        setFile(item.url);
        setFileName(item.fileName);
        setPageNumber(item.pageNumber);
        setScale(1);
        onRecentChangeRef.current?.(item);
      } catch {
        onRecentChangeRef.current?.(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 翻页时写入最近阅读
  useEffect(() => {
    if (!fileName || !file || skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void saveRecentPage(fileName, pageNumber).then(() => {
        onRecentChangeRef.current?.({
          fileName,
          pageNumber,
          url: typeof file === "string" ? file : "",
        });
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [fileName, pageNumber, file]);

  // 点击已保存标记：跳页并高亮（高亮后居中，不滚到页面顶部）
  useEffect(() => {
    if (!jumpRequest) return;

    let cancelled = false;

    (async () => {
      try {
        if (jumpRequest.fileName !== fileNameRef.current) {
          const item = await fetchRecentByFileName(jumpRequest.fileName);
          if (cancelled) return;
          if (!item) {
            setError(`找不到文件「${jumpRequest.fileName}」，请先重新打开该 PDF`);
            return;
          }
          restorePageRef.current = jumpRequest.pageNumber;
          skipPersistRef.current = true;
          setFile(item.url);
          setFileName(item.fileName);
          setPageNumber(jumpRequest.pageNumber);
          setNumPages(0);
          setScale(1);
          setError(null);
          onRecentChangeRef.current?.(item);
        } else {
          skipPersistRef.current = true;
          setPageNumber(jumpRequest.pageNumber);
          setError(null);
        }

        showHighlight(jumpRequest.rect, jumpRequest.word, jumpRequest.pageNumber);
      } catch {
        if (!cancelled) setError("跳转失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jumpRequest, showHighlight]);

  const handleTextSelect = useCallback(() => {
    const el = containerRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;

    const anchor = sel.anchorNode;
    if (!anchor || !el.contains(anchor)) return;

    const info = getSelectedWordInfo({
      selection: sel,
      pageNumber: pageNumberRef.current,
      fileName: fileNameRef.current,
    });
    if (!info) return;

    onWordSelectRef.current?.(info);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("mouseup", handleTextSelect);
    return () => el.removeEventListener("mouseup", handleTextSelect);
  }, [handleTextSelect, file]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const openFile = useCallback(async (next: File | null) => {
    if (!next) return;
    if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) {
      setError("请选择 PDF 文件");
      return;
    }

    setUploading(true);
    setError(null);
    setHighlight(null);
    try {
      const form = new FormData();
      form.append("file", next);
      const res = await fetch("/api/pdf/recent", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "上传失败");
      }

      const item = data.item as RecentItem;
      restorePageRef.current = item.pageNumber;
      skipPersistRef.current = true;
      setFile(item.url);
      setFileName(item.fileName);
      setPageNumber(item.pageNumber);
      setNumPages(0);
      setScale(1);
      onRecentChangeRef.current?.(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    const restore = restorePageRef.current;
    restorePageRef.current = null;
    if (restore != null) {
      skipPersistRef.current = true;
      setPageNumber(Math.min(Math.max(1, restore), total));
    }
    setError(null);
  }, []);

  const jumpToPage = useCallback(() => {
    if (!file || !numPages) return;
    const n = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(n)) {
      setPageInput(String(pageNumber));
      return;
    }
    const next = Math.min(Math.max(1, n), numPages);
    setHighlight(null);
    setPageNumber(next);
    setPageInput(String(next));
  }, [file, numPages, pageInput, pageNumber]);

  const goPrevPage = useCallback(() => {
    setHighlight(null);
    setPageNumber((p) => Math.max(1, p - 1));
  }, []);

  const goNextPage = useCallback(() => {
    setHighlight(null);
    setPageNumber((p) => Math.min(numPages, p + 1));
  }, [numPages]);

  // react-pdf 把 onItemClick 封进 useRef，只会拿到首次回调；必须用稳定函数 + ref 读最新页数
  const onItemClick = useCallback(({ pageNumber: target }: { pageNumber: number }) => {
    if (!Number.isFinite(target)) return;
    const total = numPagesRef.current;
    const next = total > 0 ? Math.min(Math.max(1, target), total) : Math.max(1, target);
    setHighlight(null);
    setPageNumber(next);
  }, []);

  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    // 两侧窄条翻页按钮各约 40px，再留一点边距
    return Math.min(containerWidth - 96, 900) * scale;
  }, [containerWidth, scale]);

  // 高亮出现且页面已是目标页时，把单词滚到视口中央（不是滚到阅读器顶部）
  useEffect(() => {
    if (!highlight || highlight.pageNumber !== pageNumber) return;

    const timers = [
      window.setTimeout(centerHighlight, 50),
      window.setTimeout(centerHighlight, 280),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [highlight, pageNumber, pageWidth, centerHighlight]);

  const onPageRenderSuccess = useCallback(() => {
    if (highlightRef.current) {
      centerHighlight();
    }
  }, [centerHighlight]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setAnnotateSubmenuOpen(false);
  }, []);
  const closeMarkerMenu = useCallback(() => setMarkerMenu(null), []);

  const closePinEditor = useCallback(() => {
    setActivePin(null);
    setPinDraft("");
  }, []);

  const updatePins = useCallback((kind: PinKind, updater: (prev: PdfPin[]) => PdfPin[]) => {
    if (kind === "question") setQuestions(updater);
    else setNotes(updater);
  }, []);

  const loadPins = useCallback(async (kind: PinKind, name: string) => {
    if (!name) {
      updatePins(kind, () => []);
      return;
    }
    try {
      const res = await fetch(`${PIN_API[kind]}?fileName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        updatePins(kind, () => data.items as PdfPin[]);
      }
    } catch {
      // 加载失败时保留现有列表
    }
  }, [updatePins]);

  const loadAnnotations = useCallback(async (name: string) => {
    if (!name) {
      setAnnotations([]);
      return;
    }
    try {
      const res = await fetch(`/api/pdf/annotations?fileName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setAnnotations(data.items as PdfAnnotation[]);
      }
    } catch {
      // 加载失败时保留现有列表
    }
  }, []);

  useEffect(() => {
    void loadPins("question", fileName);
    void loadPins("note", fileName);
    void loadAnnotations(fileName);
    closePinEditor();
    setDrawTool(null);
    setDraftArrow(null);
    setSelectedAnnotationId(null);
    arrowStrokeRef.current = null;
  }, [fileName, loadPins, loadAnnotations, closePinEditor]);

  const getPageNormPoint = useCallback((clientX: number, clientY: number): NormPoint | null => {
    const pageEl =
      pageFrameRef.current?.querySelector(".react-pdf__Page") ??
      (containerRef.current?.querySelector(".react-pdf__Page") as Element | null);
    if (!pageEl) return null;
    const box = (pageEl as HTMLElement).getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    return {
      x: round4(clamp01((clientX - box.left) / box.width)),
      y: round4(clamp01((clientY - box.top) / box.height)),
    };
  }, []);

  const getPageNormRect = useCallback((clientX: number, clientY: number): PdfHighlightRect | null => {
    const pageEl =
      pageFrameRef.current?.querySelector(".react-pdf__Page") ??
      (containerRef.current?.querySelector(".react-pdf__Page") as Element | null);
    if (!pageEl) return null;
    const box = (pageEl as HTMLElement).getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;

    const width = QUESTION_MARKER_PX / box.width;
    const height = QUESTION_MARKER_PX / box.height;
    const left = (clientX - box.left) / box.width - width / 2;
    const top = (clientY - box.top) / box.height - height / 2;

    return {
      left: round4(Math.min(Math.max(0, left), Math.max(0, 1 - width))),
      top: round4(Math.min(Math.max(0, top), Math.max(0, 1 - height))),
      width: round4(width),
      height: round4(height),
    };
  }, []);

  const startArrowTool = useCallback(() => {
    closeContextMenu();
    closePinEditor();
    closeMarkerMenu();
    setSelectedAnnotationId(null);
    setDraftArrow(null);
    arrowStrokeRef.current = null;
    setDrawTool("arrow");
  }, [closeContextMenu, closePinEditor, closeMarkerMenu]);

  const selectAnnotateTool = useCallback(
    (tool: AnnotateToolId) => {
      setLastAnnotateTool(tool);
      writeLastAnnotateTool(tool);
      if (tool === "arrow") {
        startArrowTool();
        return;
      }
      // 圆形 / 矩形绘制后续接入
      closeContextMenu();
    },
    [startArrowTool, closeContextMenu],
  );

  const cancelDrawTool = useCallback(() => {
    setDrawTool(null);
    setDraftArrow(null);
    arrowStrokeRef.current = null;
  }, []);

  const saveArrowAnnotation = useCallback(
    async (stroke: { x1: number; y1: number; x2: number; y2: number }) => {
      if (!fileName) return;
      try {
        const res = await fetch("/api/pdf/annotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            pageNumber: pageNumberRef.current,
            type: "arrow",
            ...stroke,
            color: ARROW_COLOR,
            strokeWidth: ARROW_STROKE_WIDTH,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "保存箭头失败");
        }
        const item = data.item as PdfAnnotation;
        setAnnotations((prev) => [item, ...prev.filter((a) => a.id !== item.id)]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存箭头失败");
      }
    },
    [fileName],
  );

  const onArrowPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || drawTool !== "arrow") return;
      const point = getPageNormPoint(e.clientX, e.clientY);
      if (!point) return;
      e.preventDefault();
      e.stopPropagation();
      arrowStrokeRef.current = {
        x1: point.x,
        y1: point.y,
        pointerId: e.pointerId,
      };
      setDraftArrow({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [drawTool, getPageNormPoint],
  );

  const onArrowPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const stroke = arrowStrokeRef.current;
      if (!stroke || stroke.pointerId !== e.pointerId) return;
      const point = getPageNormPoint(e.clientX, e.clientY);
      if (!point) return;
      setDraftArrow({ x1: stroke.x1, y1: stroke.y1, x2: point.x, y2: point.y });
    },
    [getPageNormPoint],
  );

  const onArrowPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const stroke = arrowStrokeRef.current;
      if (!stroke || stroke.pointerId !== e.pointerId) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const point = getPageNormPoint(e.clientX, e.clientY) ?? {
        x: draftArrow?.x2 ?? stroke.x1,
        y: draftArrow?.y2 ?? stroke.y1,
      };
      arrowStrokeRef.current = null;
      setDraftArrow(null);

      const pageEl =
        pageFrameRef.current?.querySelector(".react-pdf__Page") as HTMLElement | null;
      const box = pageEl?.getBoundingClientRect();
      const dxPx = box ? Math.abs(point.x - stroke.x1) * box.width : 0;
      const dyPx = box ? Math.abs(point.y - stroke.y1) * box.height : 0;
      if (Math.hypot(dxPx, dyPx) < MIN_ARROW_DRAG_PX) return;

      void saveArrowAnnotation({
        x1: stroke.x1,
        y1: stroke.y1,
        x2: point.x,
        y2: point.y,
      });
    },
    [getPageNormPoint, draftArrow, saveArrowAnnotation],
  );
  const onPdfContextMenu = useCallback(
    (e: MouseEvent) => {
      if (!file || booting) return;
      const rect = getPageNormRect(e.clientX, e.clientY);
      if (!rect) return;
      e.preventDefault();
      closeMarkerMenu();
      setAnnotateSubmenuOpen(false);
      const menuW = 140;
      const menuH = 120;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setContextMenu({
        x: Math.max(8, x),
        y: Math.max(8, y),
        pageNumber: pageNumberRef.current,
        rect,
      });
    },
    [file, booting, getPageNormRect, closeMarkerMenu],
  );

  const openMarkerMenu = useCallback(
    (
      e: MouseEvent,
      target:
        | { kind: PinKind; pin: PdfPin }
        | { kind: "arrow"; annotation: PdfAnnotation },
    ) => {
      e.preventDefault();
      e.stopPropagation();
      closeContextMenu();
      closePinEditor();
      const menuW = 120;
      const menuH = 48;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setMarkerMenu({
        x: Math.max(8, x),
        y: Math.max(8, y),
        ...target,
      });
    },
    [closeContextMenu, closePinEditor],
  );

  const deleteAnnotation = useCallback(async (a: PdfAnnotation) => {
    closeMarkerMenu();
    try {
      const res = await fetch(`/api/pdf/annotations?id=${a.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "删除失败");
      }
      setAnnotations((prev) => prev.filter((row) => row.id !== a.id));
      setSelectedAnnotationId((id) => (id === a.id ? null : id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }, [closeMarkerMenu]);

  const handleAddPin = useCallback(
    async (kind: PinKind) => {
      if (!contextMenu || !fileName) {
        closeContextMenu();
        return;
      }
      const { pageNumber: targetPage, rect } = contextMenu;
      closeContextMenu();
      const label = kind === "question" ? "问题" : "笔记";
      try {
        const res = await fetch(PIN_API[kind], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            pageNumber: targetPage,
            rect,
            content: "",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `创建${label}失败`);
        }
        const item = data.item as PdfPin;
        updatePins(kind, (prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
        setActivePin({ kind, id: item.id });
        setPinDraft(item.content ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : `创建${label}失败`);
      }
    },
    [contextMenu, fileName, closeContextMenu, updatePins],
  );

  const openPinEditor = useCallback((kind: PinKind, pin: PdfPin) => {
    setActivePin({ kind, id: pin.id });
    setPinDraft(pin.content ?? "");
  }, []);

  const savePinContent = useCallback(async () => {
    if (!activePin) return;
    setPinSaving(true);
    try {
      const res = await fetch(PIN_API[activePin.kind], {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activePin.id,
          content: pinDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      const item = data.item as PdfPin;
      updatePins(activePin.kind, (prev) => prev.map((p) => (p.id === item.id ? item : p)));
      closePinEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setPinSaving(false);
    }
  }, [activePin, pinDraft, closePinEditor, updatePins]);

  const persistPinRect = useCallback(
    async (kind: PinKind, pin: PdfPin) => {
      try {
        const res = await fetch(PIN_API[kind], {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pin.id,
            rect: {
              left: pin.rectLeft,
              top: pin.rectTop,
              width: pin.rectWidth,
              height: pin.rectHeight,
            },
            pageNumber: pin.pageNumber,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "更新位置失败");
        }
        const item = data.item as PdfPin;
        updatePins(kind, (prev) => prev.map((row) => (row.id === item.id ? item : row)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "更新位置失败");
        if (fileName) void loadPins(kind, fileName);
      }
    },
    [fileName, loadPins, updatePins],
  );

  const deletePin = useCallback(
    async (kind: PinKind, pin: PdfPin) => {
      const preview = pin.content.trim() ? `\n「${pin.content.trim().slice(0, 40)}」` : "";
      const confirmMsg =
        kind === "question"
          ? `确定删除这个问号标记吗？${preview}`
          : `确定删除这个笔记标记吗？${preview}`;
      const ok = window.confirm(confirmMsg);
      if (!ok) return;

      closePinEditor();
      try {
        const res = await fetch(`${PIN_API[kind]}?id=${pin.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "删除失败");
        }
        updatePins(kind, (prev) => prev.filter((row) => row.id !== pin.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [closePinEditor, updatePins],
  );

  const onPinPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, kind: PinKind, pin: PdfPin) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      closeContextMenu();
      closeMarkerMenu();
      closePinEditor();
      pinDragRef.current = {
        kind,
        id: pin.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originLeft: pin.rectLeft,
        originTop: pin.rectTop,
        width: pin.rectWidth,
        height: pin.rectHeight,
        currentLeft: pin.rectLeft,
        currentTop: pin.rectTop,
        moved: false,
      };
      setDraggingPin({ kind, id: pin.id });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [closeContextMenu, closeMarkerMenu, closePinEditor],
  );

  const onPinPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, kind: PinKind) => {
      const drag = pinDragRef.current;
      if (!drag || drag.kind !== kind || drag.id !== Number(e.currentTarget.dataset.pinId)) return;

      const pageEl = containerRef.current?.querySelector(".react-pdf__Page") as HTMLElement | null;
      if (!pageEl) return;
      const box = pageEl.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;

      const dx = (e.clientX - drag.startClientX) / box.width;
      const dy = (e.clientY - drag.startClientY) / box.height;
      if (Math.abs(e.clientX - drag.startClientX) > 3 || Math.abs(e.clientY - drag.startClientY) > 3) {
        drag.moved = true;
      }

      const left = round4(Math.min(Math.max(0, drag.originLeft + dx), Math.max(0, 1 - drag.width)));
      const top = round4(Math.min(Math.max(0, drag.originTop + dy), Math.max(0, 1 - drag.height)));
      drag.currentLeft = left;
      drag.currentTop = top;

      updatePins(kind, (prev) =>
        prev.map((row) =>
          row.id === drag.id ? { ...row, rectLeft: left, rectTop: top } : row,
        ),
      );
    },
    [updatePins],
  );

  const onPinPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, kind: PinKind, pin: PdfPin, openOnClick = true) => {
      const drag = pinDragRef.current;
      if (!drag || drag.kind !== kind || drag.id !== pin.id) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const moved = drag.moved;
      const next: PdfPin = {
        ...pin,
        rectLeft: drag.currentLeft,
        rectTop: drag.currentTop,
      };
      pinDragRef.current = null;
      setDraggingPin(null);

      if (moved) {
        updatePins(kind, (prev) =>
          prev.map((row) =>
            row.id === next.id ? { ...row, rectLeft: next.rectLeft, rectTop: next.rectTop } : row,
          ),
        );
        void persistPinRect(kind, next);
        return;
      }

      if (openOnClick) openPinEditor(kind, pin);
    },
    [openPinEditor, persistPinRect, updatePins],
  );
  useEffect(() => {
    if (!contextMenu) return;

    const onPointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      closeContextMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    const onScroll = () => closeContextMenu();

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [contextMenu, closeContextMenu]);

  useEffect(() => {
    if (!markerMenu) return;

    const onPointerDown = (e: PointerEvent) => {
      if (markerMenuRef.current?.contains(e.target as Node)) return;
      closeMarkerMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMarkerMenu();
    };
    const onScroll = () => closeMarkerMenu();

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [markerMenu, closeMarkerMenu]);

  useEffect(() => {
    if (!activePin) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (pinEditorRef.current?.contains(target)) return;
      if ((target as Element).closest?.("[data-question-marker],[data-note-marker]")) return;
      closePinEditor();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePinEditor();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePin, closePinEditor]);

  useEffect(() => {
    closeContextMenu();
    closeMarkerMenu();
    closePinEditor();
    setDraftArrow(null);
    setSelectedAnnotationId(null);
    arrowStrokeRef.current = null;
  }, [pageNumber, closeContextMenu, closeMarkerMenu, closePinEditor]);

  useEffect(() => {
    if (!drawTool) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDrawTool();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawTool, cancelDrawTool]);

  useEffect(() => {
    if (selectedAnnotationId == null || drawTool) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (markerMenuRef.current?.contains(target)) return;
      if (target.closest?.("[data-arrow-hit]")) return;
      setSelectedAnnotationId(null);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [selectedAnnotationId, drawTool]);

  useEffect(() => {
    if (selectedAnnotationId == null || drawTool) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedAnnotationId(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      const annotation = annotations.find((a) => a.id === selectedAnnotationId);
      if (annotation) void deleteAnnotation(annotation);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAnnotationId, drawTool, annotations, deleteAnnotation]);

  const contextMenuItems = [
    { id: "note", label: "笔记" },
    { id: "question", label: "问题" },
    { id: "annotate", label: "标注" },
    { id: "help", label: "帮助" },
  ] as const;

  const annotateSubmenuItems = [
    { id: "arrow", label: "箭头", Icon: AnnotateArrowIcon },
    { id: "circle", label: "圆形", Icon: AnnotateCircleIcon },
    { id: "rect", label: "矩形", Icon: AnnotateRectIcon },
  ] as const;

  const annotateSubmenuOnLeft = useMemo(() => {
    if (!contextMenu || typeof window === "undefined") return false;
    return contextMenu.x + 140 + 120 > window.innerWidth - 8;
  }, [contextMenu]);

  const pageQuestions = useMemo(
    () => questions.filter((q) => q.pageNumber === pageNumber),
    [questions, pageNumber],
  );

  const pageNotes = useMemo(
    () => notes.filter((n) => n.pageNumber === pageNumber),
    [notes, pageNumber],
  );

  const pageArrows = useMemo(
    () => annotations.filter((a) => a.pageNumber === pageNumber && a.type === "arrow"),
    [annotations, pageNumber],
  );

  const activePinItem = useMemo(() => {
    if (!activePin) return null;
    const list = activePin.kind === "question" ? questions : notes;
    return list.find((p) => p.id === activePin.id) ?? null;
  }, [activePin, questions, notes]);

  return (
    <div ref={rootRef} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border border-[#e7e2d9] bg-[#faf8f4] px-3 py-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="border border-[#d6d3d1] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
        >
          {uploading ? "上传中…" : "打开 PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            void openFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        <span className="min-w-0 flex-1 truncate text-sm text-[#78716c]">
          {fileName || (booting ? "恢复最近阅读…" : "未选择文件")}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!file || pageNumber <= 1}
            onClick={goPrevPage}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="上一页"
          >
            ‹
          </button>
          <label className="flex items-center gap-1 text-sm tabular-nums text-[#57534e]">
            <input
              type="number"
              min={1}
              max={numPages || undefined}
              value={pageInput}
              disabled={!file || !numPages}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={jumpToPage}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  jumpToPage();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-14 border border-[#d6d3d1] bg-white px-1.5 py-1 text-center disabled:opacity-40"
              aria-label="跳转到页码"
            />
            <span>/ {numPages || "—"}</span>
          </label>
          <button
            type="button"
            disabled={!file || pageNumber >= numPages}
            onClick={goNextPage}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="下一页"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!file || scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="缩小"
          >
            −
          </button>
          <span className="min-w-12 text-center text-sm tabular-nums text-[#57534e]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            disabled={!file || scale >= 2.5}
            onClick={() => setScale((s) => Math.min(2.5, Math.round((s + 0.1) * 10) / 10))}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="放大"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onContextMenu={onPdfContextMenu}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void openFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`relative min-h-[70vh] border border-[#e7e2d9] bg-[#efebe4] ${
          dragging ? "outline outline-2 outline-[#a8a29e]" : ""
        } ${drawTool === "arrow" ? "outline outline-2 outline-[#dc2626]/60" : ""}`}
      >
        {drawTool === "arrow" ? (
          <div className="absolute top-2 left-1/2 z-40 -translate-x-1/2 border border-[#fecaca] bg-[#fef2f2] px-3 py-1 text-xs text-[#b91c1c] shadow-sm">
            绘制箭头：按住拖动 · Esc 取消
          </div>
        ) : selectedAnnotationId != null ? (
          <div className="absolute top-2 left-1/2 z-40 -translate-x-1/2 border border-[#fecaca] bg-[#fef2f2] px-3 py-1 text-xs text-[#b91c1c] shadow-sm">
            已选中箭头 · 右键删除 / Delete · Esc 取消选中
          </div>
        ) : null}
        {file && !booting ? (
          <>
            <button
              type="button"
              disabled={pageNumber <= 1}
              onClick={goPrevPage}
              className="absolute top-0 bottom-0 left-0 z-20 w-10 border-r border-[#e7e2d9] bg-[#faf8f4]/90 text-2xl text-[#57534e] transition-colors hover:bg-[#f0ebe3] disabled:cursor-default disabled:opacity-30"
              aria-label="上一页"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={pageNumber >= numPages}
              onClick={goNextPage}
              className="absolute top-0 bottom-0 right-0 z-20 w-10 border-l border-[#e7e2d9] bg-[#faf8f4]/90 text-2xl text-[#57534e] transition-colors hover:bg-[#f0ebe3] disabled:cursor-default disabled:opacity-30"
              aria-label="下一页"
            >
              ›
            </button>
          </>
        ) : null}

        {booting ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <p className="text-sm text-[#78716c]">正在恢复上次阅读…</p>
          </div>
        ) : !file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <p className="text-base font-medium text-[#1c1917]">拖入或选择 PDF</p>
            <p className="text-sm text-[#78716c]">打开后会记住文件与页码，下次自动续读</p>
          </button>
        ) : (
          <div className="flex justify-center overflow-auto px-12 py-4">
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={() => setError("无法加载该 PDF，请换一个文件试试")}
              onItemClick={onItemClick}
              loading={<p className="py-16 text-sm text-[#78716c]">正在加载 PDF…</p>}
              error={<p className="py-16 text-sm text-[#b91c1c]">加载失败</p>}
            >
              <div ref={pageFrameRef} className="relative inline-block shadow-sm">
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                  onRenderSuccess={onPageRenderSuccess}
                  loading={<p className="py-16 text-sm text-[#78716c]">渲染中…</p>}
                />
                <svg
                  className="pointer-events-none absolute inset-0 z-[25] h-full w-full overflow-visible"
                >
                  <defs>
                    <marker
                      id="pdf-arrow-head"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="4"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L8,4 L0,8 Z" fill={ARROW_COLOR} />
                    </marker>
                    <marker
                      id="pdf-arrow-head-selected"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="4"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L8,4 L0,8 Z" fill="#b91c1c" />
                    </marker>
                  </defs>
                  {pageArrows.map((a) => (
                    <ArrowMarkup
                      key={a.id}
                      x1={a.x1}
                      y1={a.y1}
                      x2={a.x2}
                      y2={a.y2}
                      color={a.color || ARROW_COLOR}
                      strokeWidth={a.strokeWidth || ARROW_STROKE_WIDTH}
                      markerId={
                        selectedAnnotationId === a.id ? "pdf-arrow-head-selected" : "pdf-arrow-head"
                      }
                      selected={selectedAnnotationId === a.id}
                      interactive={!drawTool}
                      onSelect={() => setSelectedAnnotationId(a.id)}
                      onMenu={(e) =>
                        openMarkerMenu(e, { kind: "arrow", annotation: a })
                      }
                    />
                  ))}
                  {draftArrow ? (
                    <ArrowMarkup
                      x1={draftArrow.x1}
                      y1={draftArrow.y1}
                      x2={draftArrow.x2}
                      y2={draftArrow.y2}
                      color={ARROW_COLOR}
                      strokeWidth={ARROW_STROKE_WIDTH}
                      markerId="pdf-arrow-head"
                    />
                  ) : null}
                </svg>
                {drawTool === "arrow" ? (
                  <div
                    className="absolute inset-0 z-[26] cursor-crosshair touch-none"
                    onPointerDown={onArrowPointerDown}
                    onPointerMove={onArrowPointerMove}
                    onPointerUp={onArrowPointerUp}
                    onPointerCancel={onArrowPointerUp}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      cancelDrawTool();
                    }}
                  />
                ) : null}
                {highlight && highlight.pageNumber === pageNumber ? (
                  <div
                    ref={highlightRef}
                    aria-label={`高亮 ${highlight.word}`}
                    className="pointer-events-none absolute z-10 bg-[#fbbf24]/55 ring-2 ring-[#d97706] transition-opacity"
                    style={{
                      left: `${highlight.left * 100}%`,
                      top: `${highlight.top * 100}%`,
                      width: `${Math.max(highlight.width, 0.01) * 100}%`,
                      height: `${Math.max(highlight.height, 0.008) * 100}%`,
                    }}
                  />
                ) : null}
                {pageQuestions.map((q) => {
                  const isDragging =
                    draggingPin?.kind === "question" && draggingPin.id === q.id;
                  const isActive =
                    activePin?.kind === "question" && activePin.id === q.id;
                  return (
                    <button
                      key={`q-${q.id}`}
                      type="button"
                      data-question-marker
                      data-pin-id={q.id}
                      aria-label={q.content ? `问题：${q.content}` : "问题标记"}
                      title={q.content || "拖动移动 · 点击编辑 · 右键菜单"}
                      className={`absolute z-30 flex touch-none items-center justify-center rounded-full border text-sm font-semibold leading-none shadow-sm select-none ${
                        isDragging
                          ? "cursor-grabbing border-[#b45309] bg-[#fef3c7] text-[#92400e]"
                          : isActive
                            ? "cursor-grab border-[#b45309] bg-[#fef3c7] text-[#92400e]"
                            : q.content
                              ? "cursor-grab border-[#d97706] bg-[#fffbeb] text-[#b45309]"
                              : "cursor-grab border-[#a8a29e] bg-white text-[#57534e]"
                      }`}
                      style={{
                        left: `${q.rectLeft * 100}%`,
                        top: `${q.rectTop * 100}%`,
                        width: `${Math.max(q.rectWidth, 0.02) * 100}%`,
                        height: `${Math.max(q.rectHeight, 0.02) * 100}%`,
                      }}
                      onPointerDown={(e) => onPinPointerDown(e, "question", q)}
                      onPointerMove={(e) => onPinPointerMove(e, "question")}
                      onPointerUp={(e) => onPinPointerUp(e, "question", q)}
                      onPointerCancel={(e) => onPinPointerUp(e, "question", q, false)}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onContextMenu={(e) => openMarkerMenu(e, { kind: "question", pin: q })}
                    >
                      ?
                    </button>
                  );
                })}
                {pageNotes.map((n) => {
                  const isDragging = draggingPin?.kind === "note" && draggingPin.id === n.id;
                  const isActive = activePin?.kind === "note" && activePin.id === n.id;
                  return (
                    <button
                      key={`n-${n.id}`}
                      type="button"
                      data-note-marker
                      data-pin-id={n.id}
                      aria-label={n.content ? `笔记：${n.content}` : "笔记标记"}
                      title={n.content || "拖动移动 · 点击编辑 · 右键菜单"}
                      className={`absolute z-30 flex touch-none items-center justify-center rounded-full border shadow-sm select-none ${
                        isDragging
                          ? "cursor-grabbing border-[#475569] bg-[#e2e8f0] text-[#334155]"
                          : isActive
                            ? "cursor-grab border-[#475569] bg-[#e2e8f0] text-[#334155]"
                            : n.content
                              ? "cursor-grab border-[#64748b] bg-[#f1f5f9] text-[#475569]"
                              : "cursor-grab border-[#a8a29e] bg-white text-[#57534e]"
                      }`}
                      style={{
                        left: `${n.rectLeft * 100}%`,
                        top: `${n.rectTop * 100}%`,
                        width: `${Math.max(n.rectWidth, 0.02) * 100}%`,
                        height: `${Math.max(n.rectHeight, 0.02) * 100}%`,
                      }}
                      onPointerDown={(e) => onPinPointerDown(e, "note", n)}
                      onPointerMove={(e) => onPinPointerMove(e, "note")}
                      onPointerUp={(e) => onPinPointerUp(e, "note", n)}
                      onPointerCancel={(e) => onPinPointerUp(e, "note", n, false)}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onContextMenu={(e) => openMarkerMenu(e, { kind: "note", pin: n })}
                    >
                      <NoteMarkerIcon />
                    </button>
                  );
                })}
                {activePin && activePinItem && activePinItem.pageNumber === pageNumber ? (
                  <div
                    ref={pinEditorRef}
                    className="absolute z-40 w-56 border border-[#d6d3d1] bg-[#faf8f4] p-2 shadow-md"
                    style={{
                      left: `${Math.min((activePinItem.rectLeft + activePinItem.rectWidth) * 100, 72)}%`,
                      top: `${activePinItem.rectTop * 100}%`,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <p className="mb-1 text-xs text-[#78716c]">
                      {activePinItem.fileName} · 第 {activePinItem.pageNumber} 页
                    </p>
                    <textarea
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value)}
                      rows={3}
                      placeholder={activePin.kind === "question" ? "输入问题…" : "输入笔记…"}
                      className="w-full resize-none border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm text-[#1c1917] outline-none focus:border-[#a8a29e]"
                      autoFocus
                    />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={closePinEditor}
                        className="px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={pinSaving}
                        onClick={() => void savePinContent()}
                        className="border border-[#d6d3d1] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
                      >
                        {pinSaving ? "保存中…" : "保存"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Document>
          </div>
        )}
      </div>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          role="menu"
          className="fixed z-50 min-w-[8.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenuItems.map((item) =>
            item.id === "annotate" ? (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => setAnnotateSubmenuOpen(true)}
                onMouseLeave={() => setAnnotateSubmenuOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={annotateSubmenuOpen}
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
                  onClick={() => {
                    if (lastAnnotateTool) {
                      selectAnnotateTool(lastAnnotateTool);
                      return;
                    }
                    setAnnotateSubmenuOpen(true);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.label}</span>
                    {lastAnnotateTool ? (
                      <span className="inline-flex text-[#78716c]" title="上次工具" aria-hidden>
                        {lastAnnotateTool === "arrow" ? (
                          <AnnotateArrowIcon />
                        ) : lastAnnotateTool === "circle" ? (
                          <AnnotateCircleIcon />
                        ) : (
                          <AnnotateRectIcon />
                        )}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[#a8a29e]" aria-hidden>
                    ›
                  </span>
                </button>
                {annotateSubmenuOpen ? (
                  <div
                    role="menu"
                    className={`absolute top-0 z-50 flex border border-[#d6d3d1] bg-[#faf8f4] p-0.5 shadow-md ${
                      annotateSubmenuOnLeft ? "right-full mr-0.5" : "left-full ml-0.5"
                    }`}
                  >
                    {annotateSubmenuItems.map((sub) => {
                      const Icon = sub.Icon;
                      const active = lastAnnotateTool === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          role="menuitem"
                          title={sub.label}
                          aria-label={sub.label}
                          aria-current={active ? "true" : undefined}
                          className={`flex h-8 w-8 items-center justify-center text-[#1c1917] hover:bg-[#efebe4] ${
                            active ? "bg-[#efebe4] ring-1 ring-inset ring-[#a8a29e]" : ""
                          }`}
                          onClick={() => selectAnnotateTool(sub.id)}
                        >
                          <Icon />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
                onClick={() => {
                  if (item.id === "question") {
                    void handleAddPin("question");
                    return;
                  }
                  if (item.id === "note") {
                    void handleAddPin("note");
                    return;
                  }
                  closeContextMenu();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}

      {markerMenu ? (
        <div
          ref={markerMenuRef}
          role="menu"
          className="fixed z-50 min-w-[7.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
          style={{ left: markerMenu.x, top: markerMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-sm text-[#b91c1c] hover:bg-[#fee2e2]"
            onClick={() => {
              if (markerMenu.kind === "question" || markerMenu.kind === "note") {
                const { kind, pin } = markerMenu;
                closeMarkerMenu();
                void deletePin(kind, pin);
                return;
              }
              const a = markerMenu.annotation;
              closeMarkerMenu();
              void deleteAnnotation(a);
            }}
          >
            删除
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
    </div>
  );
}
