"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function NoteContent() {
  const searchParams = useSearchParams();
  const word = (searchParams.get("word") ?? "").trim();

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <header className="border-b border-[#e7e2d9] bg-[#faf8f4]/px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NE</p>
          <Link href="/pdf" className="text-sm text-[#78716c] hover:text-[#1c1917]">
            返回 PDF
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
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
        <div className="flex min-h-screen items-center justify-center bg-[#f6f4ef] text-sm text-[#78716c]">
          加载中…
        </div>
      }
    >
      <NoteContent />
    </Suspense>
  );
}
