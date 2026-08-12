"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { PdfWordSelectInfo } from "./get-selected-word";

const PdfViewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[70vh] items-center justify-center border border-[#e7e2d9] bg-[#efebe4]">
      <p className="text-sm text-[#78716c]">正在加载阅读器…</p>
    </div>
  ),
});

export default function PdfPageClient() {
  const [selected, setSelected] = useState<PdfWordSelectInfo | null>(null);

  const handleWordSelect = useCallback((info: PdfWordSelectInfo) => {
    setSelected(info);
    // 可把 info.locator 存起来，下次用 pageNumber + rect + context 找回
    console.log("[pdf] word selected", info);
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <header className="border-b border-[#e7e2d9] bg-[#faf8f4]/px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NE</p>
          <Link href="/" className="text-sm text-[#78716c] hover:text-[#1c1917]">
            返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <section className="mb-6 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">PDF 阅读</h1>
          <p className="max-w-xl text-base leading-7 text-[#57534e]">
            打开本地 PDF，翻页浏览；选中文字会返回单词与位置信息。
          </p>
          {selected ? (
            <div className="space-y-1 text-sm text-[#57534e]">
              <p>
                选中单词：
                <span className="font-medium text-[#1c1917]">{selected.word}</span>
                <span className="text-[#a8a29e]">
                  {" "}
                  · {selected.fileName} · 第 {selected.pageNumber} 页
                </span>
              </p>
              <p className="font-mono text-xs text-[#78716c]">
                rect: {selected.rect.left.toFixed(3)}, {selected.rect.top.toFixed(3)},{" "}
                {selected.rect.width.toFixed(3)}×{selected.rect.height.toFixed(3)}
              </p>
              {(selected.contextBefore || selected.contextAfter) && (
                <p className="text-xs text-[#a8a29e]">
                  …{selected.contextBefore}
                  <span className="text-[#1c1917]">{selected.raw}</span>
                  {selected.contextAfter}…
                </p>
              )}
            </div>
          ) : null}
        </section>

        <PdfViewer onWordSelect={handleWordSelect} />
      </main>
    </div>
  );
}
