"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NoteEditor } from "./editor";

function NoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const word = (searchParams.get("word") ?? "").trim();
  const body = searchParams.get("body") ?? "";
  const initialValue = [word ? `# ${word}` : "", body].filter(Boolean).join("\n\n");

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#f6f4ef] text-[#1c1917]">
      <header className="shrink-0 border-b border-[#e7e2d9] bg-[#faf8f4] px-6 py-4">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NE</p>
          <button
            type="button"
            onClick={() => router.push("/pdf")}
            className="text-sm text-[#78716c] hover:text-[#1c1917]"
          >
            返回 PDF
          </button>
        </div>
      </header>

      <NoteEditor key={searchParams.toString()} initialValue={initialValue ? `${initialValue}\n` : ""} />
    </div>
  );
}

export default function PdfNotePage() {
  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#f6f4ef] text-sm text-[#78716c]">
          加载中…
        </div>
      }
    >
      <NoteContent />
    </Suspense>
  );
}
