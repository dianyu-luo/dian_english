"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onWordSelectRef = useRef(onWordSelect);
  const onRecentChangeRef = useRef(onRecentChange);
  const pageNumberRef = useRef(pageNumber);
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
        }`}
      >
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
              loading={<p className="py-16 text-sm text-[#78716c]">正在加载 PDF…</p>}
              error={<p className="py-16 text-sm text-[#b91c1c]">加载失败</p>}
            >
              <div className="relative inline-block shadow-sm">
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                  onRenderSuccess={onPageRenderSuccess}
                  loading={<p className="py-16 text-sm text-[#78716c]">渲染中…</p>}
                />
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
              </div>
            </Document>
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
    </div>
  );
}
