"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PdfWordSelectInfo } from "./get-selected-word";
import type { PdfJumpRequest } from "./pdf-viewer";
import PdfChat from "./pdf-chat";

const PdfViewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[50vh] items-center justify-center border border-[#e7e2d9] bg-[#efebe4]">
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
  scale: number;
  url: string;
};

type SideTab = "chat" | "marks";

function typeLabel(type: string) {
  return type === "sentence" ? "句子" : "单词";
}

function noteSnippet(note: string, max = 36) {
  const t = note.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function SidePanel({
  sideTab,
  setSideTab,
  marks,
  selected,
  recent,
  onMarkClick,
  onClose,
  showClose,
}: {
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
  marks: SavedMark[];
  selected: PdfWordSelectInfo | null;
  recent: RecentItem | null;
  onMarkClick: (m: SavedMark) => void;
  onClose?: () => void;
  showClose?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#faf8f4]">
      <div className="flex shrink-0 items-stretch border-b border-[#e7e2d9]">
        {(
          [
            { id: "chat" as const, label: "对话" },
            // { id: "marks" as const, label: `标记${marks.length ? ` · ${marks.length}` : ""}` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSideTab(tab.id)}
            className={`flex-1 px-3 py-2.5 text-sm transition-colors ${
              sideTab === tab.id
                ? "border-b-2 border-[#1c1917] font-medium text-[#1c1917]"
                : "text-[#78716c] hover:text-[#1c1917]"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            className="px-3 text-sm text-[#78716c] hover:text-[#1c1917]"
            aria-label="关闭面板"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {sideTab === "chat" ? (
          <PdfChat
            selected={selected}
            fileName={recent?.fileName}
            pageNumber={recent?.pageNumber}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {marks.length === 0 ? (
                <p className="text-sm leading-6 text-[#78716c]">
                  暂无标记。选中单词会自动入库；写过笔记的选区会出现在这里。
                </p>
              ) : (
                <ul className="space-y-2">
                  {marks.slice(0, 50).map((m) => {
                    const snippet = noteSnippet(m.note);
                    return (
                      <li key={m.id} className="border-b border-[#e7e2d9] pb-2">
                        <button
                          type="button"
                          onClick={() => onMarkClick(m)}
                          className="w-full text-left transition-colors hover:text-[#1c1917]"
                        >
                          <span className="font-medium text-[#1c1917] underline-offset-2 hover:underline">
                            {m.word}
                          </span>
                          <span className="mt-0.5 block text-xs text-[#a8a29e]">
                            {typeLabel(m.type)} · 第 {m.pageNumber} 页
                            {snippet ? ` · ${snippet}` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PdfPageClient({
  paused = false,
  noteSlot = null,
}: {
  paused?: boolean;
  noteSlot?: ReactNode;
}) {
  const [selected, setSelected] = useState<PdfWordSelectInfo | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [marks, setMarks] = useState<SavedMark[]>([]);
  const [recent, setRecent] = useState<RecentItem | null>(null);
  const [jumpRequest, setJumpRequest] = useState<PdfJumpRequest | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>("chat");
  const [mobileSideOpen, setMobileSideOpen] = useState(false);

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
    setSideTab("chat");

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
    setMobileSideOpen(false);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f6f4ef] text-[#1c1917]">
      <header className="shrink-0 border-b border-[#e7e2d9] bg-[#faf8f4]/px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <p className="text-lg font-semibold tracking-tight">NE</p>
            <span className="hidden text-[#d6d3d1] sm:inline">/</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{paused ? "笔记" : "PDF 阅读"}</p>
              {recent ? (
                <p className="truncate text-xs text-[#78716c]">
                  {recent.fileName}
                  <span className="text-[#a8a29e]"> · 第 {recent.pageNumber} 页</span>
                  {saveMessage ? <span className="text-[#57534e]"> · {saveMessage}</span> : null}
                </p>
              ) : (
                <p className="text-xs text-[#78716c]">
                  {paused ? "编辑 Markdown 笔记" : "打开 PDF 后自动续读"}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSideOpen(true)}
              className="border border-[#d6d3d1] bg-white px-2.5 py-1 text-sm lg:hidden"
            >
              对话
            </button>
            {paused ? (
              <Link href="/pdf" className="text-sm text-[#78716c] hover:text-[#1c1917]">
                返回 PDF
              </Link>
            ) : null}
            <Link href="/" className="text-sm text-[#78716c] hover:text-[#1c1917]">
              返回首页
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              className={
                paused
                  ? "invisible pointer-events-none absolute inset-0 flex min-h-0 flex-col"
                  : "flex h-full min-h-0 flex-1 flex-col"
              }
              aria-hidden={paused}
            >
              <PdfViewer
                fillHeight
                paused={paused}
                onWordSelect={handleWordSelect}
                onRecentChange={setRecent}
                onWordMarksChange={() => void loadMarks(recent?.fileName)}
                jumpRequest={jumpRequest}
              />
            </div>
            {noteSlot ? (
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border border-[#e7e2d9] bg-[#efebe4]">
                {noteSlot}
              </div>
            ) : null}
          </div>
        </main>

        <aside className="hidden w-[380px] shrink-0 border-l border-[#e7e2d9] lg:flex lg:flex-col">
          <SidePanel
            sideTab={sideTab}
            setSideTab={setSideTab}
            marks={marks}
            selected={selected}
            recent={recent}
            onMarkClick={handleMarkClick}
          />
        </aside>
      </div>

      {mobileSideOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#1c1917]/30"
            aria-label="关闭遮罩"
            onClick={() => setMobileSideOpen(false)}
          />
          <aside className="relative ml-auto flex h-full w-[min(100%,380px)] flex-col border-l border-[#e7e2d9] bg-[#faf8f4] shadow-lg">
            <SidePanel
              sideTab={sideTab}
              setSideTab={setSideTab}
              marks={marks}
              selected={selected}
              recent={recent}
              onMarkClick={handleMarkClick}
              showClose
              onClose={() => setMobileSideOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
