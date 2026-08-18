"use client";

import { useDeferredValue, useState } from "react";
import { Markdown } from "../markdown";

type NoteEditorProps = {
  initialValue?: string;
};

export function NoteEditor({ initialValue = "" }: NoteEditorProps) {
  const [raw, setRaw] = useState(initialValue);
  const preview = useDeferredValue(raw);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <p className="shrink-0 px-5 pt-3 text-[11px] tracking-wide text-[#a8a29e] uppercase">
          Markdown
        </p>
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
