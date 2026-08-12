"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const PdfViewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[70vh] items-center justify-center border border-[#e7e2d9] bg-[#efebe4]">
      <p className="text-sm text-[#78716c]">正在加载阅读器…</p>
    </div>
  ),
});

export default function PdfPageClient() {
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
            打开本地 PDF，翻页浏览，并可缩放阅读。
          </p>
        </section>

        <PdfViewer />
      </main>
    </div>
  );
}
