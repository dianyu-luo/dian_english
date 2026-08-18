"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Markdown } from "../markdown";

export type NoteSaveKind = "word" | "question" | "note" | "bookmark";

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

export function NoteEditor({ initialValue = "", saveKind, saveId }: NoteEditorProps) {
  const [raw, setRaw] = useState(initialValue);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const preview = useDeferredValue(raw);
  const rawRef = useRef(raw);
  const lastSavedRef = useRef<string | null>(null);
  const saveKindRef = useRef(saveKind);
  const saveIdRef = useRef(saveId);
  rawRef.current = raw;
  saveKindRef.current = saveKind;
  saveIdRef.current = saveId;

  const canSave = saveKind != null && saveId != null && saveId >= 1;

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

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-baseline justify-between gap-3 px-5 pt-3">
          <p className="text-[11px] tracking-wide text-[#a8a29e] uppercase">Markdown</p>
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
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="输入 Markdown…"
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-5 py-3 font-mono text-sm leading-6 text-[#1c1917] outline-none placeholder:text-[#a8a29e]"
        />
      </section>
      <div className="h-px shrink-0 bg-[#e7e2d9] md:h-auto md:w-px" aria-hidden />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#faf8f4]">
        <p className="shrink-0 px-5 pt-3 text-[11px] tracking-wide text-[#a8a29e] uppercase">
          预览
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {preview.trim() ? (
            <Markdown content={preview} />
          ) : (
            <p className="text-sm text-[#a8a29e]">预览会显示在这里</p>
          )}
        </div>
      </section>
    </div>
  );
}
