"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PdfWordSelectInfo } from "./get-selected-word";
import type { PdfJumpRequest } from "./pdf-viewer";

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
  type: "word" | "sentence" | string;
  note: string;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  contextBefore: string;
  contextAfter: string;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
};

type RecentItem = {
  fileName: string;
  pageNumber: number;
  url: string;
};

function typeLabel(type: string) {
  return type === "sentence" ? "句子" : "单词";
}

function noteSnippet(note: string, max = 36) {
  const t = note.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export default function PdfPageClient() {
  const [selected, setSelected] = useState<PdfWordSelectInfo | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [marks, setMarks] = useState<SavedMark[]>([]);
  const [recent, setRecent] = useState<RecentItem | null>(null);
  const [jumpRequest, setJumpRequest] = useState<PdfJumpRequest | null>(null);

  const loadMarks = useCallback(async (fileName?: string) => {
    const qs = fileName ? `?fileName=${encodeURIComponent(fileName)}` : "";
    const res = await fetch(`/api/pdf/words${qs}`);
    const data = await res.json();
    if (res.ok && data.ok) {
      setMarks(data.items as SavedMark[]);
    }
  }, []);

  useEffect(() => {
    void loadMarks(recent?.fileName);
  }, [loadMarks, recent?.fileName]);

  const handleWordSelect = useCallback(async (info: PdfWordSelectInfo) => {
    setSelected(info);
    setSaveMessage("");

    let copied = false;
    try {
      await navigator.clipboard.writeText(info.word);
      copied = true;
    } catch {
      // 剪贴板权限不可用时忽略
    }

    if (info.type === "word") {
      setSaveMessage(copied ? "已复制 · 单词已入库" : "单词已入库");
      return;
    }

    setSaveMessage(copied ? "已复制句子" : "复制失败");
  }, []);

  const handleMarkClick = useCallback((m: SavedMark) => {
    setJumpRequest({
      nonce: Date.now(),
      fileName: m.fileName,
      pageNumber: m.pageNumber,
      word: m.word,
      rect: {
        left: m.rectLeft,
        top: m.rectTop,
        width: m.rectWidth,
        height: m.rectHeight,
      },
    });
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
            选中单词会自动入库；选中后可点「笔记」写备注，有笔记会高亮。点击下方标记可跳转。
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
                {selected.type === "sentence" ? "选中句子：" : "选中单词："}
                <span className="font-medium text-[#1c1917]">{selected.word}</span>
                <span className="text-[#a8a29e]">
                  {" "}
                  · {selected.fileName} · 第 {selected.pageNumber} 页
                </span>
                {saveMessage ? (
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

        <PdfViewer
          onWordSelect={handleWordSelect}
          onRecentChange={setRecent}
          onWordMarksChange={() => void loadMarks(recent?.fileName)}
          jumpRequest={jumpRequest}
        />

        {marks.length > 0 ? (
          <section className="mt-8 space-y-3 border-t border-[#d6d3d1] pt-6">
            <h2 className="text-lg font-medium">已保存标记</h2>
            <ul className="space-y-2 text-sm text-[#57534e]">
              {marks.slice(0, 20).map((m) => {
                const snippet = noteSnippet(m.note);
                return (
                  <li key={m.id} className="border-b border-[#e7e2d9] pb-2">
                    <button
                      type="button"
                      onClick={() => handleMarkClick(m)}
                      className="w-full text-left transition-colors hover:text-[#1c1917]"
                    >
                      <span className="font-medium text-[#1c1917] underline-offset-2 hover:underline">
                        {m.word}
                      </span>
                      <span className="text-[#a8a29e]">
                        {" "}
                        · {typeLabel(m.type)} · #{m.id} · {m.fileName} · 第 {m.pageNumber} 页
                        {snippet ? ` · ${snippet}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
