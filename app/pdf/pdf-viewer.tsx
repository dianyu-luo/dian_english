"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  getSelectedWordInfo,
  isEnglishWord,
  resolveHighlightRects,
  type OnPdfWordSelect,
  type PdfWordSelectInfo,
} from "./get-selected-word";
import { parsePdfJumpSearch } from "@/lib/pdf/jump-search";
import { Markdown } from "./markdown";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PdfSource = File | string | null;

type RecentItem = {
  fileName: string;
  pageNumber: number;
  scale: number;
  url: string;
  updatedAt?: string | number | Date;
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
  /** 按行高亮；缺省时退回单个 rect */
  rects?: PdfHighlightRect[];
};

type PdfViewerProps = {
  onWordSelect?: OnPdfWordSelect;
  onRecentChange?: (item: RecentItem | null) => void;
  onWordMarksChange?: () => void;
  jumpRequest?: PdfJumpRequest | null;
  /** 填满父容器高度（侧栏布局用） */
  fillHeight?: boolean;
  /** 笔记页盖住阅读器时暂停，返回后刷新标记 */
  paused?: boolean;
};

type PinKind = "question" | "note" | "bookmark" | "todo";

const PIN_KINDS: readonly PinKind[] = ["note", "question", "bookmark", "todo"];

function pinKindLabel(kind: PinKind): string {
  switch (kind) {
    case "question":
      return "问题";
    case "note":
      return "笔记";
    case "bookmark":
      return "书签";
    case "todo":
      return "待办";
  }
}

type PdfPin = {
  id: number;
  fileName: string;
  type: PinKind;
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

type SelectionMenuState = {
  x: number;
  y: number;
  info: PdfWordSelectInfo;
};

type PdfWordMark = {
  id: number;
  fileName: string;
  word: string;
  type: string;
  note: string;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  contextBefore: string;
  contextAfter: string;
  locator: string;
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
  | { x: number; y: number; kind: PinKind; pin: PdfPin }
  | { x: number; y: number; kind: "arrow"; annotation: PdfAnnotation };

type DrawTool = "arrow" | null;

type AnnotateToolId = "arrow" | "circle" | "rect";

type NormPoint = { x: number; y: number };

const QUESTION_MARKER_PX = 28;
const PIN_DOUBLE_CLICK_MS = 400;
const PINS_API = "/api/pdf/pins";
const ARROW_COLOR = "#dc2626";
const ARROW_STROKE_WIDTH = 2.5;
const MIN_ARROW_DRAG_PX = 6;
const LAST_ANNOTATE_TOOL_KEY = "pdf-last-annotate-tool";
const PDF_VIEW_MODE_KEY = "pdf-view-mode";
const CONTINUOUS_PAGE_BUFFER = 4;
const CONTINUOUS_MOUNT_ALL_LIMIT = 30;
const A4_ASPECT = 297 / 210;

type PdfViewMode = "paged" | "continuous";

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** 固定像素边长，避免用页面百分比宽高在竖版 PDF 上变成椭圆 */
function pinMarkerStyle(pin: { rectLeft: number; rectTop: number }) {
  return {
    left: `${pin.rectLeft * 100}%`,
    top: `${pin.rectTop * 100}%`,
    width: QUESTION_MARKER_PX,
    height: QUESTION_MARKER_PX,
  };
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

function readPdfViewMode(): PdfViewMode {
  try {
    const value = localStorage.getItem(PDF_VIEW_MODE_KEY);
    if (value === "continuous" || value === "paged") return value;
  } catch {
    // ignore
  }
  return "paged";
}

function writePdfViewMode(mode: PdfViewMode) {
  try {
    localStorage.setItem(PDF_VIEW_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

function pageFrameFromTarget(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target : null;
  return (el?.closest("[data-pdf-page-frame]") as HTMLElement | null) ?? null;
}

function pageElFromFrame(frame: Element | null): HTMLElement | null {
  return (frame?.querySelector(".react-pdf__Page") as HTMLElement | null) ?? null;
}

function pageNumberFromFrame(frame: Element | null): number | null {
  if (!frame) return null;
  const n = Number((frame as HTMLElement).dataset.pdfPageFrame);
  return Number.isFinite(n) && n >= 1 ? n : null;
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

function BookmarkMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 2.25h8v11.5L8 11.25 4 13.75V2.25Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.18"
      />
    </svg>
  );
}

function TodoMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </svg>
  );
}

function PinMarkdownPreview({
  pin,
  onPointerEnter,
  onPointerLeave,
}: {
  pin: PdfPin;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const content = pin.content.trim();
  if (!content) return null;
  const flipLeft = pin.rectLeft + pin.rectWidth > 0.65;
  const flipUp = pin.rectTop > 0.58;
  return (
    <div
      className="absolute z-[35]"
      style={{
        left: flipLeft ? `${pin.rectLeft * 100}%` : `${(pin.rectLeft + pin.rectWidth) * 100}%`,
        top: `${pin.rectTop * 100}%`,
        transform: [
          flipLeft ? "translateX(-100%)" : "",
          flipUp ? "translateY(calc(-100% + 8px))" : "",
        ]
          .filter(Boolean)
          .join(" "),
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div className={flipLeft ? "pr-2" : "pl-2"}>
        <div className="max-h-72 w-72 overflow-y-auto border border-[#d6d3d1] bg-[#faf8f4] px-3 py-2 shadow-md">
          <Markdown content={content} fontSize={13} />
        </div>
      </div>
    </div>
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

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2.5, Math.max(0.5, Math.round(value * 100) / 100));
}

async function saveRecentProgress(
  fileName: string,
  pageNumber: number,
  scale: number,
  totalNumber?: number,
) {
  await fetch("/api/pdf/recent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName,
      pageNumber,
      scale: clampScale(scale),
      ...(typeof totalNumber === "number" && totalNumber >= 1
        ? { totalNumber: Math.floor(totalNumber) }
        : {}),
    }),
  });
}

async function fetchRecentByFileName(fileName: string): Promise<RecentItem | null> {
  const res = await fetch(`/api/pdf/recent?fileName=${encodeURIComponent(fileName)}`);
  const data = await res.json();
  if (!res.ok || !data.ok || !data.item) return null;
  return data.item as RecentItem;
}

async function fetchRecentList(limit = 20): Promise<RecentItem[]> {
  const res = await fetch(`/api/pdf/recent?limit=${limit}`);
  const data = await res.json();
  if (!res.ok || !data.ok || !Array.isArray(data.items)) return [];
  return data.items as RecentItem[];
}

function formatRecentTime(value: string | number | Date | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function noteEditorHref(opts: {
  kind: "word" | PinKind;
  id: number;
  word?: string;
  body?: string;
}) {
  const params = new URLSearchParams();
  params.set("kind", opts.kind);
  params.set("id", String(opts.id));
  const title = opts.word?.trim();
  if (title) params.set("word", title);
  if (opts.body) params.set("body", opts.body);
  return `/pdf/note?${params}`;
}

export default function PdfViewer({
  onWordSelect,
  onRecentChange,
  onWordMarksChange,
  jumpRequest,
  fillHeight = false,
  paused = false,
}: PdfViewerProps) {
  const router = useRouter();
  const [file, setFile] = useState<PdfSource>(null);
  const [fileName, setFileName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [booting, setBooting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [highlight, setHighlight] = useState<{
    word: string;
    pageNumber: number;
    rects: PdfHighlightRect[];
  } | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
  const [annotateSubmenuOpen, setAnnotateSubmenuOpen] = useState(false);
  const [lastAnnotateTool, setLastAnnotateTool] = useState<AnnotateToolId | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenuState | null>(null);
  const [pinTypeSubmenuOpen, setPinTypeSubmenuOpen] = useState(false);
  const [pins, setPins] = useState<PdfPin[]>([]);
  const [wordMarks, setWordMarks] = useState<PdfWordMark[]>([]);
  const [activePin, setActivePin] = useState<{ kind: PinKind; id: number } | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [activeWordMarkId, setActiveWordMarkId] = useState<number | null>(null);
  const [wordMarkDraft, setWordMarkDraft] = useState("");
  const [wordMarkSaving, setWordMarkSaving] = useState(false);
  const [draggingPin, setDraggingPin] = useState<{ kind: PinKind; id: number } | null>(null);
  const [hoveredPin, setHoveredPin] = useState<{ kind: PinKind; id: number } | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<PdfViewMode>(readPdfViewMode);
  const [pageAspect, setPageAspect] = useState(A4_ASPECT);
  const [draftArrow, setDraftArrow] = useState<{
    pageNumber: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const markerMenuRef = useRef<HTMLDivElement>(null);
  const pinEditorRef = useRef<HTMLDivElement>(null);
  const wordMarkEditorRef = useRef<HTMLDivElement>(null);
  const arrowStrokeRef = useRef<{
    x1: number;
    y1: number;
    pointerId: number;
    pageNumber: number;
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
  const lastPinClickRef = useRef<{ key: string; time: number } | null>(null);
  const hoverPinTimerRef = useRef<number | null>(null);
  const hoveredPinRef = useRef(hoveredPin);
  hoveredPinRef.current = hoveredPin;
  const onWordSelectRef = useRef(onWordSelect);
  const onRecentChangeRef = useRef(onRecentChange);
  const onWordMarksChangeRef = useRef(onWordMarksChange);
  const pageNumberRef = useRef(pageNumber);
  const numPagesRef = useRef(numPages);
  const fileNameRef = useRef(fileName);
  const restorePageRef = useRef<number | null>(null);
  const pendingJumpRef = useRef<{
    word: string;
    pageNumber: number;
    rects: PdfHighlightRect[];
  } | null>(null);
  const skipPersistRef = useRef(true);
  const highlightTimerRef = useRef<number | null>(null);
  const viewModeRef = useRef(viewMode);
  const pendingScrollPageRef = useRef<number | null>(null);
  const skipScrollSyncRef = useRef(false);

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
    onWordMarksChangeRef.current = onWordMarksChange;
  }, [onWordMarksChange]);

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
    viewModeRef.current = viewMode;
  }, [viewMode]);

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
    (rects: PdfHighlightRect[], word: string, page: number) => {
      const next = rects.filter((r) => r.width > 0 && r.height > 0);
      if (next.length === 0) return;
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      setHighlight({ rects: next, word, pageNumber: page });
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlight(null);
        highlightTimerRef.current = null;
      }, 3500);
    },
    [],
  );

  // 进入页面：恢复最近阅读；支持 ?fileName= 打开指定文件；?page&word&hl= 跳转并高亮单词
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const jump = parsePdfJumpSearch(window.location.search);
        const wanted = jump.fileName;
        const res = await fetch(
          wanted
            ? `/api/pdf/recent?fileName=${encodeURIComponent(wanted)}`
            : "/api/pdf/recent",
        );
        const data = await res.json();
        if (!res.ok || !data.ok || !data.item || cancelled) {
          if (wanted && !cancelled) {
            setError(`找不到文件「${wanted}」，请先重新打开该 PDF`);
          }
          onRecentChangeRef.current?.(null);
          return;
        }

        const item = data.item as RecentItem;
        const targetPage = jump.pageNumber ?? item.pageNumber;
        restorePageRef.current = targetPage;
        if (jump.rects.length > 0) {
          pendingJumpRef.current = {
            word: jump.word ?? "",
            pageNumber: targetPage,
            rects: jump.rects,
          };
        }
        skipPersistRef.current = true;
        setFile(item.url);
        setFileName(item.fileName);
        setPageNumber(targetPage);
        setScale(clampScale(item.scale ?? 1));
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

  // 翻页 / 缩放时写入最近阅读
  useEffect(() => {
    if (!fileName || !file || skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void saveRecentProgress(fileName, pageNumber, scale, numPagesRef.current).then(() => {
        onRecentChangeRef.current?.({
          fileName,
          pageNumber,
          scale: clampScale(scale),
          url: typeof file === "string" ? file : "",
        });
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [fileName, pageNumber, scale, file]);

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
          setScale(clampScale(item.scale ?? 1));
          setError(null);
          onRecentChangeRef.current?.(item);
        } else {
          skipPersistRef.current = true;
          setPageNumber(jumpRequest.pageNumber);
          if (viewModeRef.current === "continuous") {
            pendingScrollPageRef.current = jumpRequest.pageNumber;
          }
          setError(null);
        }

        const rects =
          jumpRequest.rects && jumpRequest.rects.length > 0
            ? jumpRequest.rects
            : [jumpRequest.rect];
        showHighlight(rects, jumpRequest.word, jumpRequest.pageNumber);
      } catch {
        if (!cancelled) setError("跳转失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jumpRequest, showHighlight]);

  const handleTextSelect = useCallback((e: globalThis.MouseEvent) => {
    if (e.button !== 0) return;
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

    // 英文单词选中后自动入库（中文不算单词；不覆盖已有 note）
    if (info.type === "word" && info.fileName && isEnglishWord(info.word)) {
      void (async () => {
        try {
          const res = await fetch("/api/pdf/words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: info.fileName,
              word: info.word,
              type: "word",
              pageNumber: info.pageNumber,
              rect: info.rect,
              contextBefore: info.contextBefore,
              contextAfter: info.contextAfter,
              locator: info.locator,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) return;
          const item = data.item as PdfWordMark;
          setWordMarks((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);
          onWordMarksChangeRef.current?.();
        } catch {
          // 自动入库失败时不打断选区菜单
        }
      })();
    }

    const menuW = 88;
    const menuH = 40;
    const rangeBox = sel.getRangeAt(0).getBoundingClientRect();
    const hasRange =
      Number.isFinite(rangeBox.left) &&
      Number.isFinite(rangeBox.bottom) &&
      rangeBox.width > 0 &&
      rangeBox.height > 0;

    let preferX: number;
    let preferY: number;
      {
      // 句子：出现在鼠标附近
      preferX = e.clientX + 8;
      preferY = e.clientY + 18;
    }

    const x = Math.min(Math.max(8, preferX), window.innerWidth - menuW - 8);
    const y = Math.min(Math.max(8, preferY), window.innerHeight - menuH - 8);

    setContextMenu(null);
    setAnnotateSubmenuOpen(false);
    setMarkerMenu(null);
    setActivePin(null);
    setPinDraft("");
    setActiveWordMarkId(null);
    setWordMarkDraft("");
    setSelectionMenu({ x, y, info });
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
      setScale(clampScale(item.scale ?? 1));
      onRecentChangeRef.current?.(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }, []);

  const openRecentItem = useCallback(
    (item: RecentItem) => {
      setRecentMenuOpen(false);
      if (item.fileName === fileNameRef.current && file) {
        skipPersistRef.current = true;
        setPageNumber(item.pageNumber);
        if (viewModeRef.current === "continuous") {
          pendingScrollPageRef.current = item.pageNumber;
        }
        setScale(clampScale(item.scale ?? 1));
        setError(null);
        onRecentChangeRef.current?.(item);
        return;
      }
      restorePageRef.current = item.pageNumber;
      skipPersistRef.current = true;
      setFile(item.url);
      setFileName(item.fileName);
      setPageNumber(item.pageNumber);
      setNumPages(0);
      setScale(clampScale(item.scale ?? 1));
      setHighlight(null);
      setError(null);
      onRecentChangeRef.current?.(item);
    },
    [file],
  );

  const toggleRecentMenu = useCallback(() => {
    setRecentMenuOpen((open) => {
      const next = !open;
      if (next) {
        setRecentLoading(true);
        void fetchRecentList().then((items) => {
          setRecentItems(items);
          setRecentLoading(false);
        });
      }
      return next;
    });
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    const restore = restorePageRef.current;
    restorePageRef.current = null;
    if (restore != null) {
      const next = Math.min(Math.max(1, restore), total);
      skipPersistRef.current = true;
      setPageNumber(next);
      if (viewModeRef.current === "continuous") {
        pendingScrollPageRef.current = next;
      }
      if (pendingJumpRef.current) {
        pendingJumpRef.current = { ...pendingJumpRef.current, pageNumber: next };
      }
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
    if (viewModeRef.current === "continuous") {
      pendingScrollPageRef.current = next;
    } else {
      scrollAreaRef.current?.scrollTo({ top: 0 });
    }
  }, [file, numPages, pageInput, pageNumber]);

  const goPrevPage = useCallback(() => {
    setHighlight(null);
    setPageNumber((p) => {
      const next = Math.max(1, p - 1);
      if (viewModeRef.current === "continuous") {
        pendingScrollPageRef.current = next;
      }
      return next;
    });
  }, []);

  const goNextPage = useCallback(() => {
    setHighlight(null);
    setPageNumber((p) => {
      const next = Math.min(numPages, p + 1);
      if (viewModeRef.current === "continuous") {
        pendingScrollPageRef.current = next;
      }
      return next;
    });
    if (viewModeRef.current !== "continuous") {
      scrollAreaRef.current?.scrollTo({ top: 0 });
    }
  }, [numPages]);

  // react-pdf 把 onItemClick 封进 useRef，只会拿到首次回调；必须用稳定函数 + ref 读最新页数
  const onItemClick = useCallback(({ pageNumber: target }: { pageNumber: number }) => {
    if (!Number.isFinite(target)) return;
    const total = numPagesRef.current;
    const next = total > 0 ? Math.min(Math.max(1, target), total) : Math.max(1, target);
    setHighlight(null);
    setPageNumber(next);
    if (viewModeRef.current === "continuous") {
      pendingScrollPageRef.current = next;
    } else {
      scrollAreaRef.current?.scrollTo({ top: 0 });
    }
  }, []);

  const changeViewMode = useCallback((mode: PdfViewMode) => {
    if (mode === viewModeRef.current) return;
    setViewMode(mode);
    writePdfViewMode(mode);
    if (mode === "continuous") {
      pendingScrollPageRef.current = pageNumberRef.current;
    } else {
      scrollAreaRef.current?.scrollTo({ top: 0 });
    }
  }, []);

  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    const gutter = viewMode === "continuous" ? 32 : 96;
    return Math.min(containerWidth - gutter, 900) * scale;
  }, [containerWidth, scale, viewMode]);

  const estimatedPageHeight = useMemo(() => {
    const width = pageWidth ?? Math.max(0, containerWidth - (viewMode === "continuous" ? 32 : 96));
    return Math.max(120, width * pageAspect);
  }, [pageWidth, containerWidth, viewMode, pageAspect]);

  const continuousWindow = useMemo(() => {
    if (viewMode !== "continuous" || numPages < 1) {
      return { start: pageNumber, end: pageNumber };
    }
    return {
      start: Math.max(1, pageNumber - CONTINUOUS_PAGE_BUFFER),
      end: Math.min(numPages, pageNumber + CONTINUOUS_PAGE_BUFFER),
    };
  }, [viewMode, numPages, pageNumber]);

  const fitToWidth = useCallback(() => {
    if (!containerWidth || !fileName) return;
    const gutter = viewModeRef.current === "continuous" ? 32 : 96;
    const available = containerWidth - gutter;
    if (available <= 0) return;
    const base = Math.min(available, 900);
    const next = clampScale(Math.round((available / base) * 100) / 100);
    setScale((prev) => {
      if (prev !== next) skipPersistRef.current = true;
      return next;
    });
    if (viewModeRef.current === "continuous") {
      pendingScrollPageRef.current = pageNumberRef.current;
    }
    void saveRecentProgress(fileName, pageNumber, next, numPagesRef.current).then(() => {
      onRecentChangeRef.current?.({
        fileName,
        pageNumber,
        scale: next,
        url: typeof file === "string" ? file : "",
      });
    });
  }, [containerWidth, fileName, pageNumber, file]);

  // 高亮出现且页面已是目标页时，把单词滚到视口中央（不是滚到阅读器顶部）
  useEffect(() => {
    if (!highlight || highlight.pageNumber !== pageNumber) return;

    const timers = [
      window.setTimeout(centerHighlight, 50),
      window.setTimeout(centerHighlight, 280),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [highlight, pageNumber, pageWidth, centerHighlight]);

  const onPageLoadSuccess = useCallback(
    (page: { originalWidth: number; originalHeight: number }) => {
      if (page.originalWidth <= 0) return;
      const aspect = page.originalHeight / page.originalWidth;
      setPageAspect((prev) => (Math.abs(prev - aspect) < 0.002 ? prev : aspect));
    },
    [],
  );

  const onPageRenderSuccess = useCallback(
    (renderedPage?: number) => {
      const page = renderedPage ?? pageNumberRef.current;
      const pending = pendingJumpRef.current;
      if (pending && pending.pageNumber === page) {
        pendingJumpRef.current = null;
        showHighlight(pending.rects, pending.word, pending.pageNumber);
        return;
      }
      if (highlightRef.current) {
        centerHighlight();
      }
    },
    [centerHighlight, showHighlight],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setAnnotateSubmenuOpen(false);
  }, []);
  const closeMarkerMenu = useCallback(() => {
    setMarkerMenu(null);
    setPinTypeSubmenuOpen(false);
  }, []);
  const closeSelectionMenu = useCallback(() => setSelectionMenu(null), []);

  const closePinEditor = useCallback(() => {
    setActivePin(null);
    setPinDraft("");
  }, []);

  const closeWordMarkEditor = useCallback(() => {
    setActiveWordMarkId(null);
    setWordMarkDraft("");
  }, []);

  const clearHoverPinTimer = useCallback(() => {
    if (hoverPinTimerRef.current != null) {
      window.clearTimeout(hoverPinTimerRef.current);
      hoverPinTimerRef.current = null;
    }
  }, []);

  const onPinHoverStart = useCallback(
    (kind: PinKind, pin: PdfPin) => {
      if (!pin.content.trim()) {
        clearHoverPinTimer();
        setHoveredPin(null);
        return;
      }
      clearHoverPinTimer();
      const current = hoveredPinRef.current;
      if (current?.kind === kind && current.id === pin.id) return;
      hoverPinTimerRef.current = window.setTimeout(() => {
        setHoveredPin({ kind, id: pin.id });
      }, 160);
    },
    [clearHoverPinTimer],
  );

  const onPinHoverEnd = useCallback(() => {
    clearHoverPinTimer();
    hoverPinTimerRef.current = window.setTimeout(() => {
      setHoveredPin(null);
    }, 200);
  }, [clearHoverPinTimer]);

  useEffect(() => () => clearHoverPinTimer(), [clearHoverPinTimer]);

  const updatePins = useCallback((updater: (prev: PdfPin[]) => PdfPin[]) => {
    setPins(updater);
  }, []);

  const loadPins = useCallback(async (name: string) => {
    if (!name) {
      setPins([]);
      return;
    }
    try {
      const res = await fetch(`${PINS_API}?fileName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setPins(data.items as PdfPin[]);
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

  const loadWordMarks = useCallback(async (name: string) => {
    if (!name) {
      setWordMarks([]);
      return;
    }
    try {
      const res = await fetch(`/api/pdf/words?fileName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setWordMarks(data.items as PdfWordMark[]);
      }
    } catch {
      // 加载失败时保留现有列表
    }
  }, []);

  useEffect(() => {
    void loadPins(fileName);
    void loadAnnotations(fileName);
    void loadWordMarks(fileName);
    closePinEditor();
    closeWordMarkEditor();
    closeSelectionMenu();
    setDrawTool(null);
    setDraftArrow(null);
    setSelectedAnnotationId(null);
    arrowStrokeRef.current = null;
  }, [
    fileName,
    loadPins,
    loadAnnotations,
    loadWordMarks,
    closePinEditor,
    closeWordMarkEditor,
    closeSelectionMenu,
  ]);

  const pausedRef = useRef(paused);
  useEffect(() => {
    const wasPaused = pausedRef.current;
    pausedRef.current = paused;
    if (!wasPaused || paused || !fileName) return;
    void loadPins(fileName);
    void loadWordMarks(fileName);
    onWordMarksChangeRef.current?.();
  }, [paused, fileName, loadPins, loadWordMarks]);

  const getPageHit = useCallback(
    (
      clientX: number,
      clientY: number,
      target?: EventTarget | null,
    ): { pageEl: HTMLElement; pageNumber: number; box: DOMRect } | null => {
      const hinted = pageFrameFromTarget(target ?? null);
      let frame: Element | null = hinted;
      if (!frame) {
        const root = containerRef.current;
        if (!root) return null;
        for (const node of root.querySelectorAll("[data-pdf-page-frame]")) {
          const pageEl = pageElFromFrame(node);
          if (!pageEl) continue;
          const box = pageEl.getBoundingClientRect();
          if (
            clientX >= box.left &&
            clientX <= box.right &&
            clientY >= box.top &&
            clientY <= box.bottom
          ) {
            frame = node;
            break;
          }
        }
      }
      const pageEl = pageElFromFrame(frame);
      const page = pageNumberFromFrame(frame);
      if (!pageEl || page == null) return null;
      const box = pageEl.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return null;
      return { pageEl, pageNumber: page, box };
    },
    [],
  );

  const getPageNormPoint = useCallback(
    (clientX: number, clientY: number, target?: EventTarget | null): (NormPoint & { pageNumber: number }) | null => {
      const hit = getPageHit(clientX, clientY, target);
      if (!hit) return null;
      return {
        x: round4(clamp01((clientX - hit.box.left) / hit.box.width)),
        y: round4(clamp01((clientY - hit.box.top) / hit.box.height)),
        pageNumber: hit.pageNumber,
      };
    },
    [getPageHit],
  );

  const getPageNormRect = useCallback(
    (clientX: number, clientY: number, target?: EventTarget | null): (PdfHighlightRect & { pageNumber: number }) | null => {
      const hit = getPageHit(clientX, clientY, target);
      if (!hit) return null;

      const width = QUESTION_MARKER_PX / hit.box.width;
      const height = QUESTION_MARKER_PX / hit.box.height;
      const left = (clientX - hit.box.left) / hit.box.width - width / 2;
      const top = (clientY - hit.box.top) / hit.box.height - height / 2;

      return {
        left: round4(Math.min(Math.max(0, left), Math.max(0, 1 - width))),
        top: round4(Math.min(Math.max(0, top), Math.max(0, 1 - height))),
        width: round4(width),
        height: round4(height),
        pageNumber: hit.pageNumber,
      };
    },
    [getPageHit],
  );

  const startArrowTool = useCallback(() => {
    closeContextMenu();
    closePinEditor();
    closeWordMarkEditor();
    closeMarkerMenu();
    closeSelectionMenu();
    setSelectedAnnotationId(null);
    setDraftArrow(null);
    arrowStrokeRef.current = null;
    setDrawTool("arrow");
  }, [closeContextMenu, closePinEditor, closeWordMarkEditor, closeMarkerMenu, closeSelectionMenu]);

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
    async (stroke: { pageNumber: number; x1: number; y1: number; x2: number; y2: number }) => {
      if (!fileName) return;
      try {
        const res = await fetch("/api/pdf/annotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            pageNumber: stroke.pageNumber,
            type: "arrow",
            x1: stroke.x1,
            y1: stroke.y1,
            x2: stroke.x2,
            y2: stroke.y2,
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
      const point = getPageNormPoint(e.clientX, e.clientY, e.currentTarget);
      if (!point) return;
      e.preventDefault();
      e.stopPropagation();
      arrowStrokeRef.current = {
        x1: point.x,
        y1: point.y,
        pointerId: e.pointerId,
        pageNumber: point.pageNumber,
      };
      setDraftArrow({
        pageNumber: point.pageNumber,
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [drawTool, getPageNormPoint],
  );

  const onArrowPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const stroke = arrowStrokeRef.current;
      if (!stroke || stroke.pointerId !== e.pointerId) return;
      const point = getPageNormPoint(e.clientX, e.clientY, e.currentTarget);
      if (!point) return;
      setDraftArrow({
        pageNumber: stroke.pageNumber,
        x1: stroke.x1,
        y1: stroke.y1,
        x2: point.x,
        y2: point.y,
      });
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

      const point = getPageNormPoint(e.clientX, e.clientY, e.currentTarget) ?? {
        x: draftArrow?.x2 ?? stroke.x1,
        y: draftArrow?.y2 ?? stroke.y1,
        pageNumber: stroke.pageNumber,
      };
      arrowStrokeRef.current = null;
      setDraftArrow(null);

      const hit = getPageHit(e.clientX, e.clientY, e.currentTarget);
      const box = hit?.box;
      const dxPx = box ? Math.abs(point.x - stroke.x1) * box.width : 0;
      const dyPx = box ? Math.abs(point.y - stroke.y1) * box.height : 0;
      if (Math.hypot(dxPx, dyPx) < MIN_ARROW_DRAG_PX) return;

      void saveArrowAnnotation({
        pageNumber: stroke.pageNumber,
        x1: stroke.x1,
        y1: stroke.y1,
        x2: point.x,
        y2: point.y,
      });
    },
    [getPageNormPoint, getPageHit, draftArrow, saveArrowAnnotation],
  );
  const onPdfContextMenu = useCallback(
    (e: MouseEvent) => {
      if (!file || booting) return;
      const rect = getPageNormRect(e.clientX, e.clientY, e.target);
      if (!rect) return;
      const { pageNumber: targetPage, left, top, width, height } = rect;
      e.preventDefault();
      closeMarkerMenu();
      closeSelectionMenu();
      setAnnotateSubmenuOpen(false);
      const menuW = 140;
      const menuH = 160;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setContextMenu({
        x: Math.max(8, x),
        y: Math.max(8, y),
        pageNumber: targetPage,
        rect: { left, top, width, height },
      });
    },
    [file, booting, getPageNormRect, closeMarkerMenu, closeSelectionMenu],
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
      closeSelectionMenu();
      closePinEditor();
      closeWordMarkEditor();
      const isPin = target.kind !== "arrow";
      const menuW = isPin ? 132 : 120;
      // pin：更改类型 + 删除
      const menuH = isPin ? 72 : 48;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setPinTypeSubmenuOpen(false);
      setMarkerMenu({
        x: Math.max(8, x),
        y: Math.max(8, y),
        ...target,
      });
    },
    [closeContextMenu, closeSelectionMenu, closePinEditor, closeWordMarkEditor],
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
      closeWordMarkEditor();
      closeSelectionMenu();
      const label = pinKindLabel(kind);
      try {
        const res = await fetch(PINS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            type: kind,
            pageNumber: targetPage,
            rect,
            content: kind === "bookmark" ? `第 ${targetPage} 页` : "",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `创建${label}失败`);
        }
        const item = data.item as PdfPin;
        updatePins((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
        if (kind !== "bookmark") {
          setActivePin({ kind, id: item.id });
          setPinDraft(item.content ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `创建${label}失败`);
      }
    },
    [contextMenu, fileName, closeContextMenu, closeWordMarkEditor, closeSelectionMenu, updatePins],
  );

  const openPinEditor = useCallback((kind: PinKind, pin: PdfPin) => {
    closeWordMarkEditor();
    closeSelectionMenu();
    setActivePin({ kind, id: pin.id });
    setPinDraft(pin.content ?? "");
  }, [closeWordMarkEditor, closeSelectionMenu]);

  const openPinMarkdownEditor = useCallback(
    (kind: PinKind, pin: PdfPin, body?: string) => {
      const title = pinKindLabel(kind);
      const href = noteEditorHref({
        kind,
        id: pin.id,
        word: title,
        body: body ?? pin.content ?? "",
      });
      closePinEditor();
      closeMarkerMenu();
      router.push(href);
    },
    [closePinEditor, closeMarkerMenu, router],
  );

  const openWordMarkEditor = useCallback(
    (mark: PdfWordMark) => {
      closePinEditor();
      closeSelectionMenu();
      closeContextMenu();
      closeMarkerMenu();
      setActiveWordMarkId(mark.id);
      setWordMarkDraft(mark.note ?? "");
    },
    [closePinEditor, closeSelectionMenu, closeContextMenu, closeMarkerMenu],
  );

  const handleCreateWordNote = useCallback(async () => {
    if (!selectionMenu) {
      closeSelectionMenu();
      return;
    }
    const { info } = selectionMenu;
    closeSelectionMenu();
    try {
      const res = await fetch("/api/pdf/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: info.fileName,
          word: info.word,
          type: info.type,
          note: "",
          pageNumber: info.pageNumber,
          rect: info.rect,
          contextBefore: info.contextBefore,
          contextAfter: info.contextAfter,
          locator: info.locator,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "创建笔记失败");
      }
      const item = data.item as PdfWordMark;
      setWordMarks((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);
      openWordMarkEditor(item);
      onWordMarksChangeRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建笔记失败");
    }
  }, [selectionMenu, closeSelectionMenu, openWordMarkEditor]);

  const saveWordMarkNote = useCallback(async () => {
    if (activeWordMarkId == null) return;
    setWordMarkSaving(true);
    try {
      const res = await fetch("/api/pdf/words", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeWordMarkId,
          note: wordMarkDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      const item = data.item as PdfWordMark;
      setWordMarks((prev) => prev.map((m) => (m.id === item.id ? item : m)));
      closeWordMarkEditor();
      onWordMarksChangeRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setWordMarkSaving(false);
    }
  }, [activeWordMarkId, wordMarkDraft, closeWordMarkEditor]);

  const deleteWordMark = useCallback(
    async (mark: PdfWordMark) => {
      const preview = mark.note.trim()
        ? `\n「${mark.note.trim().slice(0, 40)}」`
        : mark.word
          ? `\n「${mark.word.slice(0, 40)}」`
          : "";
      const ok = window.confirm(`确定删除这条选区笔记吗？${preview}`);
      if (!ok) return;

      closeWordMarkEditor();
      try {
        const res = await fetch(`/api/pdf/words?id=${mark.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "删除失败");
        }
        setWordMarks((prev) => prev.filter((row) => row.id !== mark.id));
        onWordMarksChangeRef.current?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [closeWordMarkEditor],
  );

  const savePinContent = useCallback(async () => {
    if (!activePin) return;
    setPinSaving(true);
    try {
      const res = await fetch(PINS_API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activePin.id,
          type: activePin.kind,
          content: pinDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      const item = data.item as PdfPin;
      updatePins((prev) => prev.map((p) => (p.id === item.id ? item : p)));
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
        const res = await fetch(PINS_API, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pin.id,
            type: kind,
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
        updatePins((prev) => prev.map((row) => (row.id === item.id ? item : row)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "更新位置失败");
        if (fileName) void loadPins(fileName);
      }
    },
    [fileName, loadPins, updatePins],
  );

  const deletePin = useCallback(
    async (kind: PinKind, pin: PdfPin) => {
      const preview = pin.content.trim() ? `\n「${pin.content.trim().slice(0, 40)}」` : "";
      const confirmMsg = `确定删除这个${pinKindLabel(kind)}吗？${preview}`;
      const ok = window.confirm(confirmMsg);
      if (!ok) return;

      closePinEditor();
      try {
        const res = await fetch(`${PINS_API}?id=${pin.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "删除失败");
        }
        updatePins((prev) => prev.filter((row) => row.id !== pin.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [closePinEditor, updatePins],
  );

  const changePinType = useCallback(
    async (pin: PdfPin, nextType: PinKind) => {
      if (pin.type === nextType) {
        closeMarkerMenu();
        return;
      }
      closeMarkerMenu();
      try {
        const res = await fetch(PINS_API, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pin.id, type: nextType }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "修改类型失败");
        }
        const item = data.item as PdfPin;
        updatePins((prev) => prev.map((row) => (row.id === item.id ? item : row)));
        setActivePin((prev) =>
          prev?.id === item.id ? { kind: nextType, id: item.id } : prev,
        );
        setHoveredPin((prev) =>
          prev?.id === item.id ? { kind: nextType, id: item.id } : prev,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "修改类型失败");
        if (fileName) void loadPins(fileName);
      }
    },
    [closeMarkerMenu, updatePins, fileName, loadPins],
  );

  const onPinPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, kind: PinKind, pin: PdfPin) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      closeContextMenu();
      closeMarkerMenu();
      closeSelectionMenu();
      closePinEditor();
      closeWordMarkEditor();
      clearHoverPinTimer();
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
    [closeContextMenu, closeMarkerMenu, closeSelectionMenu, closePinEditor, closeWordMarkEditor, clearHoverPinTimer],
  );

  const onPinPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, kind: PinKind) => {
      const drag = pinDragRef.current;
      if (!drag || drag.kind !== kind || drag.id !== Number(e.currentTarget.dataset.pinId)) return;

      const pageEl = pageElFromFrame(pageFrameFromTarget(e.currentTarget));
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

      updatePins((prev) =>
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
        lastPinClickRef.current = null;
        updatePins((prev) =>
          prev.map((row) =>
            row.id === next.id ? { ...row, rectLeft: next.rectLeft, rectTop: next.rectTop } : row,
          ),
        );
        void persistPinRect(kind, next);
        return;
      }

      if (e.type !== "pointerup") return;

      const now = performance.now();
      const key = `${kind}:${pin.id}`;
      const last = lastPinClickRef.current;
      const isDouble = Boolean(last && last.key === key && now - last.time < PIN_DOUBLE_CLICK_MS);
      lastPinClickRef.current = { key, time: now };

      if (isDouble) {
        lastPinClickRef.current = null;
        openPinMarkdownEditor(kind, pin);
        return;
      }

      if (openOnClick) openPinEditor(kind, pin);
    },
    [openPinEditor, openPinMarkdownEditor, persistPinRect, updatePins],
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
    if (!selectionMenu) return;

    const onPointerDown = (e: PointerEvent) => {
      if (selectionMenuRef.current?.contains(e.target as Node)) return;
      closeSelectionMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSelectionMenu();
    };
    const onScroll = () => closeSelectionMenu();

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [selectionMenu, closeSelectionMenu]);

  useEffect(() => {
    if (!recentMenuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (recentMenuRef.current?.contains(e.target as Node)) return;
      setRecentMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecentMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [recentMenuOpen]);

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
      if ((target as Element).closest?.("[data-question-marker],[data-note-marker],[data-bookmark-marker],[data-todo-marker]")) return;
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
    if (activeWordMarkId == null) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wordMarkEditorRef.current?.contains(target)) return;
      if ((target as Element).closest?.("[data-word-mark]")) return;
      closeWordMarkEditor();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWordMarkEditor();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeWordMarkId, closeWordMarkEditor]);

  useEffect(() => {
    if (viewMode === "continuous") return;
    closeContextMenu();
    closeMarkerMenu();
    closeSelectionMenu();
    closePinEditor();
    closeWordMarkEditor();
    setDraftArrow(null);
    setSelectedAnnotationId(null);
    arrowStrokeRef.current = null;
  }, [
    pageNumber,
    viewMode,
    closeContextMenu,
    closeMarkerMenu,
    closeSelectionMenu,
    closePinEditor,
    closeWordMarkEditor,
  ]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const root = scrollAreaRef.current;
    if (!root) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (skipScrollSyncRef.current) return;
        const mid = root.scrollTop + root.clientHeight / 2;
        let best = pageNumberRef.current;
        let bestDist = Infinity;
        root.querySelectorAll("[data-pdf-page-slot]").forEach((node) => {
          const el = node as HTMLElement;
          const n = Number(el.dataset.pdfPageSlot);
          if (!Number.isFinite(n)) return;
          const center = el.offsetTop + el.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = n;
          }
        });
        if (best !== pageNumberRef.current) setPageNumber(best);
      });
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [viewMode, file, numPages]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const target = pendingScrollPageRef.current;
    if (target == null) return;
    const el = scrollAreaRef.current?.querySelector(
      `[data-pdf-page-slot="${target}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    skipScrollSyncRef.current = true;
    el.scrollIntoView({ block: "start" });
    pendingScrollPageRef.current = null;
    const timer = window.setTimeout(() => {
      skipScrollSyncRef.current = false;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [viewMode, pageNumber, numPages, pageWidth, continuousWindow.start, continuousWindow.end]);

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
    { id: "bookmark", label: "书签" },
    { id: "todo", label: "待办" },
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

  const pinTypeSubmenuOnLeft = useMemo(() => {
    if (!markerMenu || typeof window === "undefined") return false;
    return markerMenu.x + 140 + 120 > window.innerWidth - 8;
  }, [markerMenu]);

  const activePinItem = useMemo(() => {
    if (!activePin) return null;
    return pins.find((p) => p.id === activePin.id && p.type === activePin.kind) ?? null;
  }, [activePin, pins]);

  const hoveredPinItem = useMemo(() => {
    if (!hoveredPin || draggingPin || activePin || markerMenu) return null;
    const pin = pins.find((p) => p.id === hoveredPin.id && p.type === hoveredPin.kind);
    if (!pin || !pin.content.trim()) return null;
    return pin;
  }, [hoveredPin, draggingPin, activePin, markerMenu, pins]);

  const activeWordMarkItem = useMemo(() => {
    if (activeWordMarkId == null) return null;
    return wordMarks.find((m) => m.id === activeWordMarkId) ?? null;
  }, [activeWordMarkId, wordMarks]);

  return (
    <div ref={rootRef} className={fillHeight ? "flex h-full min-h-0 flex-col gap-3" : "space-y-4"}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border border-[#e7e2d9] bg-[#faf8f4] px-3 py-2">
        <div ref={recentMenuRef} className="relative">
          <button
            type="button"
            onClick={toggleRecentMenu}
            disabled={uploading || booting}
            aria-haspopup="menu"
            aria-expanded={recentMenuOpen}
            className="border border-[#d6d3d1] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
          >
            最近打开
          </button>
          {recentMenuOpen ? (
            <div
              role="menu"
              className="absolute top-full left-0 z-50 mt-1 max-h-72 w-72 overflow-auto border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
            >
              {recentLoading ? (
                <p className="px-3 py-2 text-sm text-[#78716c]">加载中…</p>
              ) : recentItems.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[#78716c]">暂无最近打开的文件</p>
              ) : (
                recentItems.map((item) => {
                  const active = item.fileName === fileName;
                  const time = formatRecentTime(item.updatedAt);
                  return (
                    <button
                      key={item.fileName}
                      type="button"
                      role="menuitem"
                      onClick={() => openRecentItem(item)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-[#f0ebe3] ${
                        active ? "bg-[#efebe4]" : ""
                      }`}
                    >
                      <span className="truncate text-sm font-medium text-[#1c1917]">
                        {item.fileName}
                      </span>
                      <span className="text-xs text-[#a8a29e]">
                        第 {item.pageNumber} 页
                        {time ? ` · ${time}` : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
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
            onClick={() => {
              if (viewModeRef.current === "continuous") {
                pendingScrollPageRef.current = pageNumberRef.current;
              }
              setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10));
            }}
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
            onClick={() => {
              if (viewModeRef.current === "continuous") {
                pendingScrollPageRef.current = pageNumberRef.current;
              }
              setScale((s) => Math.min(2.5, Math.round((s + 0.1) * 10) / 10));
            }}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="放大"
          >
            +
          </button>
          <button
            type="button"
            disabled={!file || !containerWidth}
            onClick={fitToWidth}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="适应宽度"
            title="适应宽度"
          >
            适应宽度
          </button>
        </div>

        <div className="flex items-center">
          <button
            type="button"
            disabled={!file}
            aria-pressed={viewMode === "paged"}
            onClick={() => changeViewMode("paged")}
            className={`border px-2.5 py-1.5 text-sm disabled:opacity-40 ${
              viewMode === "paged"
                ? "border-[#a8a29e] bg-[#efebe4] font-medium text-[#1c1917]"
                : "border-[#d6d3d1] bg-white text-[#57534e] hover:bg-[#f0ebe3]"
            }`}
            title="单页左右翻页"
          >
            单页
          </button>
          <button
            type="button"
            disabled={!file}
            aria-pressed={viewMode === "continuous"}
            onClick={() => changeViewMode("continuous")}
            className={`-ml-px border px-2.5 py-1.5 text-sm disabled:opacity-40 ${
              viewMode === "continuous"
                ? "border-[#a8a29e] bg-[#efebe4] font-medium text-[#1c1917]"
                : "border-[#d6d3d1] bg-white text-[#57534e] hover:bg-[#f0ebe3]"
            }`}
            title="连续滚动阅读"
          >
            连续
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
        className={`relative border border-[#e7e2d9] bg-[#efebe4] ${
          fillHeight ? "min-h-0 flex-1" : "min-h-[70vh]"
        } ${
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
        {file && !booting && viewMode === "paged" ? (
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
          <div className={`flex items-center justify-center ${fillHeight ? "h-full" : "min-h-[70vh]"}`}>
            <p className="text-sm text-[#78716c]">正在恢复上次阅读…</p>
          </div>
        ) : !file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex w-full flex-col items-center justify-center gap-2 px-6 text-center ${
              fillHeight ? "h-full" : "min-h-[70vh]"
            }`}
          >
            <p className="text-base font-medium text-[#1c1917]">拖入或选择 PDF</p>
            <p className="text-sm text-[#78716c]">打开后会记住文件与页码，下次自动续读</p>
          </button>
        ) : (
          <div
            ref={scrollAreaRef}
            className={`overflow-auto py-4 ${
              viewMode === "continuous" ? "px-4" : "flex justify-center px-12"
            } ${fillHeight ? "h-full" : ""}`}
          >
            <Document
              file={file}
              className={viewMode === "continuous" ? "flex flex-col items-center" : undefined}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={() => setError("无法加载该 PDF，请换一个文件试试")}
              onItemClick={onItemClick}
              loading={<p className="py-16 text-sm text-[#78716c]">正在加载 PDF…</p>}
              error={<p className="py-16 text-sm text-[#b91c1c]">加载失败</p>}
            >
              {(viewMode === "continuous" && numPages > 0
                ? Array.from({ length: numPages }, (_, i) => i + 1)
                : [pageNumber]
              ).map((sheetPage) => {
                const mounted =
                  viewMode !== "continuous" ||
                  numPages <= CONTINUOUS_MOUNT_ALL_LIMIT ||
                  (sheetPage >= continuousWindow.start && sheetPage <= continuousWindow.end);
                const arrowHeadId = `pdf-arrow-head-${sheetPage}`;
                const arrowHeadSelectedId = `pdf-arrow-head-selected-${sheetPage}`;
                const pageQuestions = pins.filter(
                  (q) => q.type === "question" && q.pageNumber === sheetPage,
                );
                const pageNotes = pins.filter(
                  (n) => n.type === "note" && n.pageNumber === sheetPage,
                );
                const pageBookmarks = pins.filter(
                  (b) => b.type === "bookmark" && b.pageNumber === sheetPage,
                );
                const pageTodos = pins.filter(
                  (t) => t.type === "todo" && t.pageNumber === sheetPage,
                );
                const pageArrows = annotations.filter(
                  (a) => a.pageNumber === sheetPage && a.type === "arrow",
                );
                const pageWordMarks = wordMarks.filter(
                  (m) => m.pageNumber === sheetPage && m.note.trim().length > 0,
                );
                return (
                <div
                  key={sheetPage}
                  data-pdf-page-slot={sheetPage}
                  className={
                    viewMode === "continuous" ? "mb-3 flex justify-center last:mb-0" : undefined
                  }
                  style={
                    viewMode === "continuous" && !mounted
                      ? { height: estimatedPageHeight }
                      : undefined
                  }
                >
                  {mounted ? (
              <div data-pdf-page-frame={sheetPage} className="relative inline-block shadow-sm">
                <Page
                  pageNumber={sheetPage}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                  onLoadSuccess={onPageLoadSuccess}
                  onRenderSuccess={() => onPageRenderSuccess(sheetPage)}
                  loading={<p className="py-16 text-sm text-[#78716c]">渲染中…</p>}
                />
                <svg
                  className="pointer-events-none absolute inset-0 z-[25] h-full w-full overflow-visible"
                >
                  <defs>
                    <marker
                      id={arrowHeadId}
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
                      id={arrowHeadSelectedId}
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
                        selectedAnnotationId === a.id ? arrowHeadSelectedId : arrowHeadId
                      }
                      selected={selectedAnnotationId === a.id}
                      interactive={!drawTool}
                      onSelect={() => setSelectedAnnotationId(a.id)}
                      onMenu={(e) =>
                        openMarkerMenu(e, { kind: "arrow", annotation: a })
                      }
                    />
                  ))}
                  {draftArrow && draftArrow.pageNumber === sheetPage ? (
                    <ArrowMarkup
                      x1={draftArrow.x1}
                      y1={draftArrow.y1}
                      x2={draftArrow.x2}
                      y2={draftArrow.y2}
                      color={ARROW_COLOR}
                      strokeWidth={ARROW_STROKE_WIDTH}
                      markerId={arrowHeadId}
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
                {highlight && highlight.pageNumber === sheetPage
                  ? highlight.rects.map((r, i) => (
                      <div
                        key={`hl-${i}`}
                        ref={i === 0 ? highlightRef : undefined}
                        aria-label={i === 0 ? `高亮 ${highlight.word}` : undefined}
                        aria-hidden={i === 0 ? undefined : true}
                        className="pointer-events-none absolute z-10 bg-[#fbbf24]/55 ring-1 ring-[#d97706] transition-opacity"
                        style={{
                          left: `${r.left * 100}%`,
                          top: `${r.top * 100}%`,
                          width: `${Math.max(r.width, 0.01) * 100}%`,
                          height: `${Math.max(r.height, 0.008) * 100}%`,
                        }}
                      />
                    ))
                  : null}
                {pageWordMarks.flatMap((m) => {
                  const isActive = activeWordMarkId === m.id;
                  const strips = resolveHighlightRects({
                    locator: m.locator,
                    rect: {
                      left: m.rectLeft,
                      top: m.rectTop,
                      width: m.rectWidth,
                      height: m.rectHeight,
                    },
                  });
                  return strips.map((r, i) => (
                    <button
                      key={`wm-${m.id}-${i}`}
                      type="button"
                      data-word-mark
                      data-word-mark-id={m.id}
                      aria-label={
                        i === 0
                          ? m.note
                            ? `选区笔记：${m.note}`
                            : `选区笔记：${m.word}`
                          : undefined
                      }
                      aria-hidden={i === 0 ? undefined : true}
                      title={i === 0 ? m.note || m.word : undefined}
                      tabIndex={i === 0 ? 0 : -1}
                      className={`absolute z-[15] cursor-pointer border-0 p-0 ${
                        isActive
                          ? "bg-[#fbbf24]/70 ring-2 ring-[#d97706]"
                          : "bg-[#fbbf24]/55 ring-1 ring-[#d97706]/80 hover:bg-[#fbbf24]/70"
                      }`}
                      style={{
                        left: `${r.left * 100}%`,
                        top: `${r.top * 100}%`,
                        width: `${Math.max(r.width, 0.01) * 100}%`,
                        height: `${Math.max(r.height, 0.008) * 100}%`,
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openWordMarkEditor(m);
                      }}
                    />
                  ));
                })}
                {pageQuestions.map((q) => {
                  const isDragging =
                    draggingPin?.kind === "question" && draggingPin.id === q.id;
                  const isActive =
                    activePin?.kind === "question" && activePin.id === q.id;
                  const isHovered =
                    hoveredPin?.kind === "question" && hoveredPin.id === q.id;
                  return (
                    <button
                      key={`q-${q.id}`}
                      type="button"
                      data-question-marker
                      data-pin-id={q.id}
                      aria-label={q.content ? `问题：${q.content}` : "问题标记"}
                      title={q.content.trim() ? undefined : "拖动移动 · 点击编辑 · 双击进入编辑界面 · 右键菜单"}
                      className={`absolute z-30 flex touch-none items-center justify-center rounded-full border text-sm font-semibold leading-none shadow-sm select-none ${
                        isDragging
                          ? "cursor-grabbing border-[#b45309] bg-[#fef3c7] text-[#92400e]"
                          : isActive
                            ? "cursor-grab border-[#b45309] bg-[#fef3c7] text-[#92400e]"
                            : q.content
                              ? "cursor-grab border-[#d97706] bg-[#fffbeb] text-[#b45309]"
                              : "cursor-grab border-[#a8a29e] bg-white text-[#57534e]"
                      } ${isDragging || isActive || isHovered ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
                      style={pinMarkerStyle(q)}
                      onPointerDown={(e) => onPinPointerDown(e, "question", q)}
                      onPointerMove={(e) => onPinPointerMove(e, "question")}
                      onPointerUp={(e) => onPinPointerUp(e, "question", q)}
                      onPointerCancel={(e) => onPinPointerUp(e, "question", q, false)}
                      onPointerEnter={() => onPinHoverStart("question", q)}
                      onPointerLeave={onPinHoverEnd}
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
                  const isHovered = hoveredPin?.kind === "note" && hoveredPin.id === n.id;
                  return (
                    <button
                      key={`n-${n.id}`}
                      type="button"
                      data-note-marker
                      data-pin-id={n.id}
                      aria-label={n.content ? `笔记：${n.content}` : "笔记标记"}
                      title={n.content.trim() ? undefined : "拖动移动 · 点击编辑 · 双击进入编辑界面 · 右键菜单"}
                      className={`absolute z-30 flex touch-none items-center justify-center rounded-full border shadow-sm select-none ${
                        isDragging
                          ? "cursor-grabbing border-[#475569] bg-[#e2e8f0] text-[#334155]"
                          : isActive
                            ? "cursor-grab border-[#475569] bg-[#e2e8f0] text-[#334155]"
                            : n.content
                              ? "cursor-grab border-[#64748b] bg-[#f1f5f9] text-[#475569]"
                              : "cursor-grab border-[#a8a29e] bg-white text-[#57534e]"
                      } ${isDragging || isActive || isHovered ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
                      style={pinMarkerStyle(n)}
                      onPointerDown={(e) => onPinPointerDown(e, "note", n)}
                      onPointerMove={(e) => onPinPointerMove(e, "note")}
                      onPointerUp={(e) => onPinPointerUp(e, "note", n)}
                      onPointerCancel={(e) => onPinPointerUp(e, "note", n, false)}
                      onPointerEnter={() => onPinHoverStart("note", n)}
                      onPointerLeave={onPinHoverEnd}
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
                {pageBookmarks.map((b) => {
                  const isDragging =
                    draggingPin?.kind === "bookmark" && draggingPin.id === b.id;
                  const isHovered =
                    hoveredPin?.kind === "bookmark" && hoveredPin.id === b.id;
                  return (
                    <button
                      key={`b-${b.id}`}
                      type="button"
                      data-bookmark-marker
                      data-pin-id={b.id}
                      aria-label={b.content ? `书签：${b.content}` : "书签"}
                      title={b.content.trim() ? undefined : "拖动移动 · 双击进入编辑界面 · 右键删除"}
                      className={`absolute z-30 flex touch-none items-center justify-center rounded-full border shadow-sm select-none ${
                        isDragging
                          ? "cursor-grabbing border-[#9a3412] bg-[#ffedd5] text-[#9a3412]"
                          : "cursor-grab border-[#ea580c] bg-[#fff7ed] text-[#c2410c]"
                      } ${isDragging || isHovered ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
                      style={pinMarkerStyle(b)}
                      onPointerDown={(e) => onPinPointerDown(e, "bookmark", b)}
                      onPointerMove={(e) => onPinPointerMove(e, "bookmark")}
                      onPointerUp={(e) => onPinPointerUp(e, "bookmark", b, false)}
                      onPointerCancel={(e) => onPinPointerUp(e, "bookmark", b, false)}
                      onPointerEnter={() => onPinHoverStart("bookmark", b)}
                      onPointerLeave={onPinHoverEnd}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onContextMenu={(e) => openMarkerMenu(e, { kind: "bookmark", pin: b })}
                    >
                      <BookmarkMarkerIcon />
                    </button>
                  );
                })}
                {pageTodos.map((t) => {
                  const isDragging = draggingPin?.kind === "todo" && draggingPin.id === t.id;
                  const isActive = activePin?.kind === "todo" && activePin.id === t.id;
                  const isHovered = hoveredPin?.kind === "todo" && hoveredPin.id === t.id;
                  return (
                    <button
                      key={`t-${t.id}`}
                      type="button"
                      data-todo-marker
                      data-pin-id={t.id}
                      aria-label={t.content ? `待办：${t.content}` : "待办标记"}
                      title={t.content.trim() ? undefined : "拖动移动 · 点击编辑 · 双击进入编辑界面 · 右键菜单"}
                      className={`absolute z-30 flex touch-none items-center justify-center rounded-full border shadow-sm select-none ${
                        isDragging
                          ? "cursor-grabbing border-[#0f766e] bg-[#ccfbf1] text-[#115e59]"
                          : isActive
                            ? "cursor-grab border-[#0f766e] bg-[#ccfbf1] text-[#115e59]"
                            : t.content
                              ? "cursor-grab border-[#14b8a6] bg-[#f0fdfa] text-[#0f766e]"
                              : "cursor-grab border-[#a8a29e] bg-white text-[#57534e]"
                      } ${isDragging || isActive || isHovered ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
                      style={pinMarkerStyle(t)}
                      onPointerDown={(e) => onPinPointerDown(e, "todo", t)}
                      onPointerMove={(e) => onPinPointerMove(e, "todo")}
                      onPointerUp={(e) => onPinPointerUp(e, "todo", t)}
                      onPointerCancel={(e) => onPinPointerUp(e, "todo", t, false)}
                      onPointerEnter={() => onPinHoverStart("todo", t)}
                      onPointerLeave={onPinHoverEnd}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onContextMenu={(e) => openMarkerMenu(e, { kind: "todo", pin: t })}
                    >
                      <TodoMarkerIcon />
                    </button>
                  );
                })}
                {hoveredPinItem && hoveredPinItem.pageNumber === sheetPage ? (
                  <PinMarkdownPreview
                    pin={hoveredPinItem}
                    onPointerEnter={() => onPinHoverStart(hoveredPinItem.type, hoveredPinItem)}
                    onPointerLeave={onPinHoverEnd}
                  />
                ) : null}
                {activePin && activePinItem && activePinItem.pageNumber === sheetPage ? (
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          if (!pinSaving) void savePinContent();
                        }
                      }}
                      rows={3}
                      placeholder={
                        activePin.kind === "question"
                          ? "输入问题…"
                          : activePin.kind === "todo"
                            ? "输入待办…"
                            : "输入笔记…"
                      }
                      className="w-full resize-none border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm text-[#1c1917] outline-none focus:border-[#a8a29e]"
                      autoFocus
                    />
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pinSaving}
                        onClick={() => {
                          if (!activePin || !activePinItem) return;
                          void deletePin(activePin.kind, activePinItem);
                        }}
                        className="px-2 py-1 text-xs text-[#b91c1c] hover:bg-[#fee2e2] disabled:opacity-50"
                      >
                        删除
                      </button>
                      <span className="mx-0.5 h-3 w-px shrink-0 bg-[#e7e5e4]" aria-hidden />
                      <div className="ml-auto flex items-center">
                        <button
                          type="button"
                          onClick={closePinEditor}
                          className="px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!activePin || !activePinItem) return;
                            openPinMarkdownEditor(activePin.kind, activePinItem, pinDraft);
                          }}
                          className="px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={pinSaving}
                          title="Ctrl+Enter"
                          onClick={() => void savePinContent()}
                          className="ml-0.5 border border-[#d6d3d1] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
                        >
                          {pinSaving ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {activeWordMarkItem && activeWordMarkItem.pageNumber === sheetPage ? (
                  <div
                    ref={wordMarkEditorRef}
                    className="absolute z-40 w-56 border border-[#d6d3d1] bg-[#faf8f4] p-2 shadow-md"
                    style={{
                      left: `${Math.min(
                        (activeWordMarkItem.rectLeft + activeWordMarkItem.rectWidth) * 100,
                        72,
                      )}%`,
                      top: `${activeWordMarkItem.rectTop * 100}%`,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <p className="mb-1 text-xs text-[#78716c]">
                      {activeWordMarkItem.type === "sentence" ? "句子" : "单词"} ·{" "}
                      {activeWordMarkItem.word.slice(0, 24)}
                      {activeWordMarkItem.word.length > 24 ? "…" : ""} · 第{" "}
                      {activeWordMarkItem.pageNumber} 页
                    </p>
                    <textarea
                      value={wordMarkDraft}
                      onChange={(e) => setWordMarkDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          if (!wordMarkSaving) void saveWordMarkNote();
                        }
                      }}
                      rows={3}
                      placeholder="输入笔记…"
                      className="w-full resize-none border border-[#d6d3d1] bg-white px-2 py-1.5 text-sm text-[#1c1917] outline-none focus:border-[#a8a29e]"
                      autoFocus
                    />
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        disabled={wordMarkSaving}
                        onClick={() => void deleteWordMark(activeWordMarkItem)}
                        className="px-2 py-1 text-xs text-[#b91c1c] hover:bg-[#fee2e2] disabled:opacity-50"
                      >
                        删除
                      </button>
                      <span className="mx-0.5 h-3 w-px shrink-0 bg-[#e7e5e4]" aria-hidden />
                      <div className="ml-auto flex items-center">
                        <button
                          type="button"
                          onClick={closeWordMarkEditor}
                          className="px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const href = noteEditorHref({
                              kind: "word",
                              id: activeWordMarkItem.id,
                              word: activeWordMarkItem.word,
                              body: wordMarkDraft,
                            });
                            closeWordMarkEditor();
                            router.push(href);
                          }}
                          className="px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={wordMarkSaving}
                          title="Ctrl+Enter"
                          onClick={() => void saveWordMarkNote()}
                          className="ml-0.5 border border-[#d6d3d1] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
                        >
                          {wordMarkSaving ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
                  ) : null}
                </div>
                );
              })}
            </Document>
          </div>
        )}
      </div>

      {selectionMenu ? (
        <div
          ref={selectionMenuRef}
          role="menu"
          className="fixed z-50 min-w-[5.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
            onClick={() => void handleCreateWordNote()}
          >
            添加笔记
          </button>
        </div>
      ) : null}

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
                  if (
                    item.id === "question" ||
                    item.id === "note" ||
                    item.id === "bookmark" ||
                    item.id === "todo"
                  ) {
                    void handleAddPin(item.id);
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
          {markerMenu.kind !== "arrow" ? (
            <>
              <div
                className="relative"
                onMouseEnter={() => setPinTypeSubmenuOpen(true)}
                onMouseLeave={() => setPinTypeSubmenuOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={pinTypeSubmenuOpen}
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
                  onClick={() => setPinTypeSubmenuOpen((open) => !open)}
                >
                  <span>更改类型</span>
                  <span className="text-[#a8a29e]" aria-hidden>
                    ›
                  </span>
                </button>
                {pinTypeSubmenuOpen ? (
                  <div
                    role="menu"
                    className={`absolute top-0 z-50 min-w-[6.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md ${
                      pinTypeSubmenuOnLeft ? "right-full mr-0.5" : "left-full ml-0.5"
                    }`}
                  >
                    {PIN_KINDS.filter((k) => k !== markerMenu.kind).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
                        onClick={() => void changePinType(markerMenu.pin, k)}
                      >
                        {pinKindLabel(k)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="my-1 border-t border-[#e7e2d9]" role="separator" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-sm text-[#b91c1c] hover:bg-[#fee2e2]"
            onClick={() => {
              if (markerMenu.kind !== "arrow") {
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
