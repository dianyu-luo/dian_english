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

type PdfQuestion = {
  id: number;
  fileName: string;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  content: string;
};

type ContextMenuState = {
  x: number;
  y: number;
  pageNumber: number;
  rect: PdfHighlightRect;
};

type MarkerMenuState = {
  x: number;
  y: number;
  question: PdfQuestion;
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

type DrawTool = "arrow" | null;

type NormPoint = { x: number; y: number };

const QUESTION_MARKER_PX = 28;
const ARROW_COLOR = "#dc2626";
const ARROW_STROKE_WIDTH = 2.5;
const MIN_ARROW_DRAG_PX = 6;

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
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

function ArrowMarkup({
  x1,
  y1,
  x2,
  y2,
  color,
  strokeWidth,
  markerId,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  markerId: string;
}) {
  return (
    <line
      x1={`${x1 * 100}%`}
      y1={`${y1 * 100}%`}
      x2={`${x2 * 100}%`}
      y2={`${y2 * 100}%`}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      markerEnd={`url(#${markerId})`}
    />
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
  const [markerMenu, setMarkerMenu] = useState<MarkerMenuState | null>(null);
  const [questions, setQuestions] = useState<PdfQuestion[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [questionSaving, setQuestionSaving] = useState(false);
  const [draggingQuestionId, setDraggingQuestionId] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
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
  const questionEditorRef = useRef<HTMLDivElement>(null);
  const pageFrameRef = useRef<HTMLDivElement>(null);
  const arrowStrokeRef = useRef<{
    x1: number;
    y1: number;
    pointerId: number;
  } | null>(null);
  const questionDragRef = useRef<{
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

  const closeQuestionEditor = useCallback(() => {
    setActiveQuestionId(null);
    setQuestionDraft("");
  }, []);

  const loadQuestions = useCallback(async (name: string) => {
    if (!name) {
      setQuestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/pdf/questions?fileName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setQuestions(data.items as PdfQuestion[]);
      }
    } catch {
      // 加载失败时保留现有列表
    }
  }, []);

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
    void loadQuestions(fileName);
    void loadAnnotations(fileName);
    closeQuestionEditor();
    setDrawTool(null);
    setDraftArrow(null);
    arrowStrokeRef.current = null;
  }, [fileName, loadQuestions, loadAnnotations, closeQuestionEditor]);

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
    closeQuestionEditor();
    closeMarkerMenu();
    setDraftArrow(null);
    arrowStrokeRef.current = null;
    setDrawTool("arrow");
  }, [closeContextMenu, closeQuestionEditor, closeMarkerMenu]);

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
    (e: MouseEvent, q: PdfQuestion) => {
      e.preventDefault();
      e.stopPropagation();
      closeContextMenu();
      closeQuestionEditor();
      const menuW = 120;
      const menuH = 48;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setMarkerMenu({
        x: Math.max(8, x),
        y: Math.max(8, y),
        question: q,
      });
    },
    [closeContextMenu, closeQuestionEditor],
  );

  const handleAddQuestion = useCallback(async () => {
    if (!contextMenu || !fileName) {
      closeContextMenu();
      return;
    }
    const { pageNumber: targetPage, rect } = contextMenu;
    closeContextMenu();
    try {
      const res = await fetch("/api/pdf/questions", {
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
        throw new Error(data.error ?? "创建问题失败");
      }
      const item = data.item as PdfQuestion;
      setQuestions((prev) => [item, ...prev.filter((q) => q.id !== item.id)]);
      setActiveQuestionId(item.id);
      setQuestionDraft(item.content ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建问题失败");
    }
  }, [contextMenu, fileName, closeContextMenu]);

  const openQuestionEditor = useCallback((q: PdfQuestion) => {
    setActiveQuestionId(q.id);
    setQuestionDraft(q.content ?? "");
  }, []);

  const saveQuestionContent = useCallback(async () => {
    if (activeQuestionId == null) return;
    setQuestionSaving(true);
    try {
      const res = await fetch("/api/pdf/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeQuestionId,
          content: questionDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      const item = data.item as PdfQuestion;
      setQuestions((prev) => prev.map((q) => (q.id === item.id ? item : q)));
      closeQuestionEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setQuestionSaving(false);
    }
  }, [activeQuestionId, questionDraft, closeQuestionEditor]);

  const persistQuestionRect = useCallback(async (q: PdfQuestion) => {
    try {
      const res = await fetch("/api/pdf/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: q.id,
          rect: {
            left: q.rectLeft,
            top: q.rectTop,
            width: q.rectWidth,
            height: q.rectHeight,
          },
          pageNumber: q.pageNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "更新位置失败");
      }
      const item = data.item as PdfQuestion;
      setQuestions((prev) => prev.map((row) => (row.id === item.id ? item : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新位置失败");
      if (fileName) void loadQuestions(fileName);
    }
  }, [fileName, loadQuestions]);

  const deleteQuestion = useCallback(
    async (q: PdfQuestion) => {
      const preview = q.content.trim() ? `\n「${q.content.trim().slice(0, 40)}」` : "";
      const ok = window.confirm(`确定删除这个问号标记吗？${preview}`);
      if (!ok) return;

      closeQuestionEditor();
      try {
        const res = await fetch(`/api/pdf/questions?id=${q.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "删除失败");
        }
        setQuestions((prev) => prev.filter((row) => row.id !== q.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [closeQuestionEditor],
  );

  const onQuestionPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, q: PdfQuestion) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      closeContextMenu();
      closeMarkerMenu();
      closeQuestionEditor();
      questionDragRef.current = {
        id: q.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originLeft: q.rectLeft,
        originTop: q.rectTop,
        width: q.rectWidth,
        height: q.rectHeight,
        currentLeft: q.rectLeft,
        currentTop: q.rectTop,
        moved: false,
      };
      setDraggingQuestionId(q.id);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [closeContextMenu, closeMarkerMenu, closeQuestionEditor],
  );

  const onQuestionPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = questionDragRef.current;
    if (!drag || drag.id !== Number(e.currentTarget.dataset.questionId)) return;

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

    setQuestions((prev) =>
      prev.map((row) =>
        row.id === drag.id ? { ...row, rectLeft: left, rectTop: top } : row,
      ),
    );
  }, []);

  const onQuestionPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, q: PdfQuestion, openOnClick = true) => {
      const drag = questionDragRef.current;
      if (!drag || drag.id !== q.id) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const moved = drag.moved;
      const next: PdfQuestion = {
        ...q,
        rectLeft: drag.currentLeft,
        rectTop: drag.currentTop,
      };
      questionDragRef.current = null;
      setDraggingQuestionId(null);

      if (moved) {
        setQuestions((prev) =>
          prev.map((row) =>
            row.id === next.id ? { ...row, rectLeft: next.rectLeft, rectTop: next.rectTop } : row,
          ),
        );
        void persistQuestionRect(next);
        return;
      }

      if (openOnClick) openQuestionEditor(q);
    },
    [openQuestionEditor, persistQuestionRect],
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
    if (activeQuestionId == null) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (questionEditorRef.current?.contains(target)) return;
      if ((target as Element).closest?.("[data-question-marker]")) return;
      closeQuestionEditor();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeQuestionEditor();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeQuestionId, closeQuestionEditor]);

  useEffect(() => {
    closeContextMenu();
    closeMarkerMenu();
    closeQuestionEditor();
    setDraftArrow(null);
    arrowStrokeRef.current = null;
  }, [pageNumber, closeContextMenu, closeMarkerMenu, closeQuestionEditor]);

  useEffect(() => {
    if (!drawTool) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDrawTool();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawTool, cancelDrawTool]);

  const contextMenuItems = [
    { id: "annotate", label: "标注" },
    { id: "question", label: "问题" },
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

  const pageArrows = useMemo(
    () => annotations.filter((a) => a.pageNumber === pageNumber && a.type === "arrow"),
    [annotations, pageNumber],
  );

  const activeQuestion = useMemo(
    () => questions.find((q) => q.id === activeQuestionId) ?? null,
    [questions, activeQuestionId],
  );

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
                  aria-hidden
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
                      markerId="pdf-arrow-head"
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
                {pageQuestions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    data-question-marker
                    data-question-id={q.id}
                    aria-label={q.content ? `问题：${q.content}` : "问题标记"}
                    title={q.content || "拖动移动 · 点击编辑 · 右键菜单"}
                    className={`absolute z-30 flex touch-none items-center justify-center rounded-full border text-sm font-semibold leading-none shadow-sm select-none ${
                      draggingQuestionId === q.id
                        ? "cursor-grabbing border-[#b45309] bg-[#fef3c7] text-[#92400e]"
                        : activeQuestionId === q.id
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
                    onPointerDown={(e) => onQuestionPointerDown(e, q)}
                    onPointerMove={onQuestionPointerMove}
                    onPointerUp={(e) => onQuestionPointerUp(e, q)}
                    onPointerCancel={(e) => onQuestionPointerUp(e, q, false)}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onContextMenu={(e) => openMarkerMenu(e, q)}
                  >
                    ?
                  </button>
                ))}
                {activeQuestion && activeQuestion.pageNumber === pageNumber ? (
                  <div
                    ref={questionEditorRef}
                    className="absolute z-40 w-56 border border-[#d6d3d1] bg-[#faf8f4] p-2 shadow-md"
                    style={{
                      left: `${Math.min((activeQuestion.rectLeft + activeQuestion.rectWidth) * 100, 72)}%`,
                      top: `${activeQuestion.rectTop * 100}%`,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <p className="mb-1 text-xs text-[#78716c]">
                      {activeQuestion.fileName} · 第 {activeQuestion.pageNumber} 页
                    </p>
                    <textarea
                      value={questionDraft}
                      onChange={(e) => setQuestionDraft(e.target.value)}
                      rows={3}
                      placeholder="输入问题…"
                      className="w-full resize-none border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm text-[#1c1917] outline-none focus:border-[#a8a29e]"
                      autoFocus
                    />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={closeQuestionEditor}
                        className="px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={questionSaving}
                        onClick={() => void saveQuestionContent()}
                        className="border border-[#d6d3d1] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
                      >
                        {questionSaving ? "保存中…" : "保存"}
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
                  onClick={() => setAnnotateSubmenuOpen((open) => !open)}
                >
                  <span>{item.label}</span>
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
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          role="menuitem"
                          title={sub.label}
                          aria-label={sub.label}
                          className="flex h-8 w-8 items-center justify-center text-[#1c1917] hover:bg-[#efebe4]"
                          onClick={() => {
                            if (sub.id === "arrow") {
                              startArrowTool();
                              return;
                            }
                            closeContextMenu();
                          }}
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
                    void handleAddQuestion();
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
              const q = markerMenu.question;
              closeMarkerMenu();
              void deleteQuestion(q);
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
