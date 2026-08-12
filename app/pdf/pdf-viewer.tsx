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

type PdfViewerProps = {
  onWordSelect?: OnPdfWordSelect;
  onRecentChange?: (item: RecentItem | null) => void;
};

async function saveRecentPage(fileName: string, pageNumber: number) {
  await fetch("/api/pdf/recent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, pageNumber }),
  });
}

export default function PdfViewer({ onWordSelect, onRecentChange }: PdfViewerProps) {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onWordSelectRef = useRef(onWordSelect);
  const onRecentChangeRef = useRef(onRecentChange);
  const pageNumberRef = useRef(pageNumber);
  const fileNameRef = useRef(fileName);
  const restorePageRef = useRef<number | null>(null);
  const skipPersistRef = useRef(true);

  useEffect(() => {
    onWordSelectRef.current = onWordSelect;
  }, [onWordSelect]);

  useEffect(() => {
    onRecentChangeRef.current = onRecentChange;
  }, [onRecentChange]);

  useEffect(() => {
    pageNumberRef.current = pageNumber;
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

  const openFile = useCallback(async (next: File | null) => {
    if (!next) return;
    if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) {
      setError("请选择 PDF 文件");
      return;
    }

    setUploading(true);
    setError(null);
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

  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    return Math.min(containerWidth - 32, 900) * scale;
  }, [containerWidth, scale]);

  return (
    <div className="space-y-4">
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
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="border border-[#d6d3d1] bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
            aria-label="上一页"
          >
            ‹
          </button>
          <span className="min-w-20 text-center text-sm tabular-nums text-[#57534e]">
            {numPages ? `${pageNumber} / ${numPages}` : "—"}
          </span>
          <button
            type="button"
            disabled={!file || pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
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
        className={`min-h-[70vh] border border-[#e7e2d9] bg-[#efebe4] ${
          dragging ? "outline outline-2 outline-[#a8a29e]" : ""
        }`}
      >
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
          <div className="flex justify-center overflow-auto p-4">
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={() => setError("无法加载该 PDF，请换一个文件试试")}
              loading={<p className="py-16 text-sm text-[#78716c]">正在加载 PDF…</p>}
              error={<p className="py-16 text-sm text-[#b91c1c]">加载失败</p>}
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderTextLayer
                renderAnnotationLayer
                className="shadow-sm"
                loading={<p className="py-16 text-sm text-[#78716c]">渲染中…</p>}
              />
            </Document>
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
    </div>
  );
}
