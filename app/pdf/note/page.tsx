"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function NoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const word = (searchParams.get("word") ?? "").trim();

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#f6f4ef] text-[#1c1917]">
      <header className="shrink-0 border-b border-[#e7e2d9] bg-[#faf8f4]/px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
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

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-10">
        <p className="text-[11px] tracking-wide text-[#a8a29e] uppercase">笔记</p>
        {word ? (
          <h1 className="mt-3 text-4xl font-semibold tracking-tight break-words">{word}</h1>
        ) : (
          <p className="mt-3 text-base text-[#78716c]">未指定单词，请从 PDF 选中后再打开笔记。</p>
        )}
      </main>
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
