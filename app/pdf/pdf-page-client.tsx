"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PdfWordSelectInfo } from "./get-selected-word";

const PdfViewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[70vh] items-center justify-center border border-[#e7e2d9] bg-[#efebe4]">
      <p className="text-sm text-[#78716c]">正在加载阅读器…</p>
    </div>
  ),
});

type SavedMark = {
  id: number;
  fileName: string;
  word: string;
  raw: string;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  contextBefore: string;
  contextAfter: string;
  createdAt: string | number | Date;
};

type RecentItem = {
  fileName: string;
  pageNumber: number;
  url: string;
};

export default function PdfPageClient() {
  const [selected, setSelected] = useState<PdfWordSelectInfo | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [marks, setMarks] = useState<SavedMark[]>([]);
  const [recent, setRecent] = useState<RecentItem | null>(null);

  const loadMarks = useCallback(async (fileName?: string) => {
    const qs = fileName ? `?fileName=${encodeURIComponent(fileName)}` : "";
    const res = await fetch(`/api/pdf/words${qs}`);
    const data = await res.json();
    if (res.ok && data.ok) {
      setMarks(data.items as SavedMark[]);
    }
  }, []);

  useEffect(() => {
    void loadMarks();
  }, [loadMarks]);

  const handleWordSelect = useCallback(
    async (info: PdfWordSelectInfo) => {
      setSelected(info);
      setSaving(true);
      setSaveMessage("");
      try {
        const res = await fetch("/api/pdf/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: info.fileName,
            word: info.word,
            raw: info.raw,
            pageNumber: info.pageNumber,
            rect: info.rect,
            contextBefore: info.contextBefore,
            contextAfter: info.contextAfter,
            locator: info.locator,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "保存失败");
        }
        setSaveMessage(`已保存 #${data.item.id}`);
        await loadMarks(info.fileName);
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : "保存失败");
      } finally {
        setSaving(false);
      }
    },
    [loadMarks],
  );

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
            选中单词会写入数据库；阅读进度记入「最近阅读」，下次自动打开到对应页。
          </p>
          {recent ? (
            <p className="text-sm text-[#57534e]">
              最近阅读：
              <span className="font-medium text-[#1c1917]">{recent.fileName}</span>
              <span className="text-[#a8a29e]"> · 第 {recent.pageNumber} 页</span>
            </p>
          ) : null}
          {selected ? (
            <div className="space-y-1 text-sm text-[#57534e]">
              <p>
                选中单词：
                <span className="font-medium text-[#1c1917]">{selected.word}</span>
                <span className="text-[#a8a29e]">
                  {" "}
                  · {selected.fileName} · 第 {selected.pageNumber} 页
                </span>
                {saving ? (
                  <span className="text-[#a8a29e]"> · 保存中…</span>
                ) : saveMessage ? (
                  <span className="text-[#57534e]"> · {saveMessage}</span>
                ) : null}
              </p>
              <p className="font-mono text-xs text-[#78716c]">
                rect: {selected.rect.left.toFixed(3)}, {selected.rect.top.toFixed(3)},{" "}
                {selected.rect.width.toFixed(3)}×{selected.rect.height.toFixed(3)}
              </p>
            </div>
          ) : null}
        </section>

        <PdfViewer onWordSelect={handleWordSelect} onRecentChange={setRecent} />

        {marks.length > 0 ? (
          <section className="mt-8 space-y-3 border-t border-[#d6d3d1] pt-6">
            <h2 className="text-lg font-medium">已保存标记</h2>
            <ul className="space-y-2 text-sm text-[#57534e]">
              {marks.slice(0, 20).map((m) => (
                <li key={m.id} className="border-b border-[#e7e2d9] pb-2">
                  <span className="font-medium text-[#1c1917]">{m.word}</span>
                  <span className="text-[#a8a29e]">
                    {" "}
                    · #{m.id} · {m.fileName} · 第 {m.pageNumber} 页 · (
                    {m.rectLeft.toFixed(3)}, {m.rectTop.toFixed(3)})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
