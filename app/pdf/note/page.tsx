"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { parseNoteSaveTarget } from "@/lib/note";
import { NoteEditor } from "./editor";

function NoteContent() {
  const searchParams = useSearchParams();
  const word = (searchParams.get("word") ?? "").trim();
  const body = searchParams.get("body") ?? "";
  const target = parseNoteSaveTarget(searchParams);
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
