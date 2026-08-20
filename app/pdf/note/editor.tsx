"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "../markdown";

export type NoteSaveKind = "word" | "question" | "note" | "bookmark" | "todo";

async function persistNoteMarkdown(kind: NoteSaveKind, id: number, markdown: string) {
  if (kind === "word") {
    const res = await fetch("/api/pdf/words", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, note: markdown }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? "保存失败");
    return;
  }

  const res = await fetch("/api/pdf/pins", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type: kind, content: markdown }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error ?? "保存失败");
}

type NoteEditorProps = {
  initialValue?: string;
  saveKind?: NoteSaveKind;
  saveId?: number;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const FONT_MIN = 12;
const FONT_MAX = 48;
const FONT_STEP = 2;
const FONT_DEFAULT = 14;
const FONT_STORAGE_KEY = "pdf-note-font-size";
const LINE_HEIGHT = 1.65;
const EDITOR_PAD_X = 20;
const EDITOR_PAD_TOP = 12;

function clampFontSize(n: number) {
  const snapped = Math.round(n / FONT_STEP) * FONT_STEP;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, snapped));
}

function firstDiffOffset(a: string, b: string) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}

function scrollPreviewToNewContent(container: HTMLElement, prev: string, next: string) {
  const markdown = container.querySelector(".markdown");
  if (!markdown) return;

  const padBottom = Number.parseFloat(getComputedStyle(container).paddingBottom) || 0;
  const contentHeight = Math.max(0, container.scrollHeight - padBottom);
  const offset = firstDiffOffset(prev, next);
  const nearEnd = next.length === 0 || offset >= prev.length || offset >= next.length * 0.85;

  let y = contentHeight;
  if (nearEnd) {
    const last = markdown.lastElementChild as HTMLElement | null;
    if (last) {
      const cRect = container.getBoundingClientRect();
      const tRect = last.getBoundingClientRect();
      y = tRect.bottom - cRect.top + container.scrollTop;
    }
  } else if (next.length > 0) {
    y = contentHeight * (offset / next.length);
  }

  container.scrollTop = Math.max(0, y - container.clientHeight / 2);
}

export function NoteEditor({ initialValue = "", saveKind, saveId }: NoteEditorProps) {
  const router = useRouter();
  const [raw, setRaw] = useState(initialValue);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);
  const preview = useDeferredValue(raw);
  const rawRef = useRef(raw);
  const lastSavedRef = useRef<string | null>(null);
  const saveKindRef = useRef(saveKind);
  const saveIdRef = useRef(saveId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const lastPreviewRef = useRef(preview);
  const skipPreviewFollowRef = useRef(true);
  rawRef.current = raw;
  saveKindRef.current = saveKind;
  saveIdRef.current = saveId;

  const canSave = saveKind != null && saveId != null && saveId >= 1;

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(FONT_STORAGE_KEY));
      if (Number.isFinite(stored) && stored > 0) setFontSize(clampFontSize(stored));
    } catch {
      // ignore
    }
  }, []);

  const changeFontSize = (next: number) => {
    const size = clampFontSize(next);
    setFontSize(size);
    try {
      localStorage.setItem(FONT_STORAGE_KEY, String(size));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!canSave || saveKind == null || saveId == null) return;

    if (raw === lastSavedRef.current) {
      setStatus((s) => (s === "idle" ? s : "saved"));
      return;
    }

    setStatus("saving");
    const handle = window.setTimeout(() => {
      void persistNoteMarkdown(saveKind, saveId, raw)
        .then(() => {
          if (rawRef.current !== raw) return;
          lastSavedRef.current = raw;
          setStatus("saved");
        })
        .catch(() => {
          if (rawRef.current !== raw) return;
          setStatus("error");
        });
    }, 600);

    return () => window.clearTimeout(handle);
  }, [canSave, raw, saveKind, saveId]);

  useEffect(() => {
    if (!canSave) return;
    return () => {
      const kind = saveKindRef.current;
      const id = saveIdRef.current;
      const content = rawRef.current;
      if (kind == null || id == null || content === lastSavedRef.current) return;
      void persistNoteMarkdown(kind, id, content)
        .then(() => {
          lastSavedRef.current = content;
        })
        .catch(() => {
          // 离开页面时无法展示错误
        });
    };
  }, [canSave]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      router.push("/pdf");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const sync = () => {
      const line = fontSize * LINE_HEIGHT;
      const pad = Math.max(0, el.clientHeight - EDITOR_PAD_TOP - line);
      el.style.paddingBottom = `${pad}px`;
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fontSize]);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;

    const sync = () => {
      const line = fontSize * LINE_HEIGHT;
      const pad = Math.max(0, el.clientHeight - EDITOR_PAD_TOP - line);
      el.style.paddingBottom = `${pad}px`;
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fontSize]);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;

    if (skipPreviewFollowRef.current) {
      skipPreviewFollowRef.current = false;
      lastPreviewRef.current = preview;
      return;
    }

    if (preview === lastPreviewRef.current) return;
    const prev = lastPreviewRef.current;
    lastPreviewRef.current = preview;
    if (!preview.trim()) return;
    scrollPreviewToNewContent(el, prev, preview);
  }, [preview]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col md:flex-row">
      <Link
        href="/pdf"
        className="absolute top-2 right-2 z-10 px-2 py-1 text-xs text-[#78716c] hover:text-[#1c1917]"
      >
        关闭
      </Link>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pr-14">
          <p className="text-[11px] tracking-wide text-[#a8a29e] uppercase">Markdown</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center text-[#a8a29e]">
              <button
                type="button"
                aria-label="减小字体"
                disabled={fontSize <= FONT_MIN}
                onClick={() => changeFontSize(fontSize - FONT_STEP)}
                className="px-1 py-0.5 text-[11px] hover:text-[#1c1917] disabled:opacity-30"
              >
                A-
              </button>
              <span className="min-w-8 text-center text-[11px] tabular-nums">{fontSize}</span>
              <button
                type="button"
                aria-label="增大字体"
                disabled={fontSize >= FONT_MAX}
                onClick={() => changeFontSize(fontSize + FONT_STEP)}
                className="px-1 py-0.5 text-[13px] leading-none hover:text-[#1c1917] disabled:opacity-30"
              >
                A+
              </button>
            </div>
            {canSave ? (
              <p className="text-[11px] text-[#a8a29e]">
                {status === "saving"
                  ? "保存中…"
                  : status === "error"
                    ? "保存失败"
                    : status === "saved"
                      ? "已保存"
                      : ""}
              </p>
            ) : null}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="输入 Markdown…"
          spellCheck={false}
          style={{
            fontSize,
            lineHeight: LINE_HEIGHT,
            paddingLeft: EDITOR_PAD_X,
            paddingRight: EDITOR_PAD_X,
            paddingTop: EDITOR_PAD_TOP,
          }}
          className="min-h-0 flex-1 resize-none bg-transparent font-mono text-[#1c1917] outline-none placeholder:text-[#a8a29e]"
        />
      </section>
      <div className="h-px shrink-0 bg-[#e7e2d9] md:h-auto md:w-px" aria-hidden />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#faf8f4]">
        <p className="shrink-0 px-5 pt-3 pr-14 text-[11px] tracking-wide text-[#a8a29e] uppercase">
          预览
        </p>
        <div ref={previewRef} className="min-h-0 flex-1 overflow-y-auto px-5 pt-3">
          {preview.trim() ? (
            <Markdown content={preview} fontSize={fontSize} />
          ) : (
            <p className="text-[#a8a29e]" style={{ fontSize }}>
              预览会显示在这里
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
