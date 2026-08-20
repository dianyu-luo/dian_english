"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NoteEditor, type NoteSaveKind } from "./editor";

const SAVE_KINDS = new Set<NoteSaveKind>(["word", "question", "note", "bookmark", "todo"]);

function parseSaveTarget(searchParams: URLSearchParams): { kind: NoteSaveKind; id: number } | null {
  const kind = searchParams.get("kind");
  const id = Number(searchParams.get("id"));
  if (!kind || !SAVE_KINDS.has(kind as NoteSaveKind) || !Number.isFinite(id) || id < 1) {
    return null;
  }
  return { kind: kind as NoteSaveKind, id };
}

function NoteContent() {
  const searchParams = useSearchParams();
  const word = (searchParams.get("word") ?? "").trim();
  const body = searchParams.get("body") ?? "";
  const target = parseSaveTarget(searchParams);
  const initialValue = target
    ? body
    : [word ? `# ${word}` : "", body].filter(Boolean).join("\n\n");

  return (
    <NoteEditor
      key={searchParams.toString()}
      initialValue={initialValue}
      saveKind={target?.kind}
      saveId={target?.id}
    />
  );
}

export default function PdfNotePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-[#78716c]">
          加载中…
        </div>
      }
    >
      <NoteContent />
    </Suspense>
  );
}
