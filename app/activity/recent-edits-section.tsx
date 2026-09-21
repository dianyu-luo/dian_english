"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/activity/format-relative-time";
import {
  recentEditColor,
  type RecentEditColor,
  type RecentEditKind,
} from "@/lib/activity/recent-edit";

/** 可序列化传入客户端的最近编辑项 */
export type RecentEditListItem = {
  key: string;
  kind: RecentEditKind;
  kindLabel: string;
  type: string;
  typeLabel: string;
  title: string;
  fileName: string;
  pageNumber: number;
  updatedAt: string;
  href: string;
};

const RECENT_EDIT_BADGE: Record<RecentEditColor, string> = {
  word: "border-[#facc15] bg-[#fef9c3] text-[#854d0e]",
  question: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
  note: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
  bookmark: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
  todo: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]",
  review: "border-[#c4b5fd] bg-[#f5f3ff] text-[#6d28d9]",
  intensive: "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]",
  annotation: "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c]",
};

type EditFilter = "all" | RecentEditColor;

const FILTERS: { id: EditFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "word", label: "划词" },
  { id: "question", label: "问题" },
  { id: "note", label: "笔记" },
  { id: "bookmark", label: "书签" },
  { id: "review", label: "复习" },
  { id: "todo", label: "待办" },
  { id: "intensive", label: "精读" },
  { id: "annotation", label: "批注" },
];

type Props = {
  items: RecentEditListItem[];
  /** 热力图选中的页；有值时只显示该页 */
  selectedPage?: number | null;
  onClearPage?: () => void;
  /** 列表是否显示文件名（总览页需要，单文件详情不需要） */
  showFileName?: boolean;
  /** 未选页时最多显示条数；不传则显示全部匹配项 */
  defaultLimit?: number;
  /** 空状态文案：应用总览 / 单文件 */
  emptyContext?: "app" | "file";
};

export function RecentEditsSection({
  items,
  selectedPage = null,
  onClearPage,
  showFileName = true,
  defaultLimit,
  emptyContext = "app",
}: Props) {
  const [filter, setFilter] = useState<EditFilter>("all");

  const pageItems = useMemo(() => {
    if (selectedPage == null) return items;
    return items.filter((item) => item.pageNumber === selectedPage);
  }, [items, selectedPage]);

  const counts = useMemo(() => {
    const map: Record<RecentEditColor, number> = {
      word: 0,
      question: 0,
      note: 0,
      bookmark: 0,
      review: 0,
      todo: 0,
      intensive: 0,
      annotation: 0,
    };
    for (const item of pageItems) {
      map[recentEditColor(item)] += 1;
    }
    return map;
  }, [pageItems]);

  const filtered = useMemo(() => {
    const list =
      filter === "all"
        ? pageItems
        : pageItems.filter((item) => recentEditColor(item) === filter);
    if (selectedPage == null && defaultLimit != null) {
      return list.slice(0, defaultLimit);
    }
    return list;
  }, [pageItems, filter, selectedPage, defaultLimit]);

  const title =
    selectedPage != null ? `第 ${selectedPage} 页编辑内容` : "最近编辑内容";

  if (items.length === 0) {
    return (
      <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
        <h2 className="text-lg font-medium">最近编辑内容</h2>
        <p className="text-sm leading-6 text-[#78716c]">
          {emptyContext === "file"
            ? "本文件暂无笔记、标记或批注。"
            : "暂无数据。接入后这里会显示笔记、标记和批注的变更。"}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          {selectedPage != null ? (
            <p className="mt-1 text-sm text-[#78716c]">
              来自上方热力图选中的页
            </p>
          ) : null}
        </div>
        {selectedPage != null && onClearPage ? (
          <button
            type="button"
            onClick={onClearPage}
            className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-1.5 text-sm text-[#3f3f46] hover:bg-[#f4f4f5]"
          >
            显示全部最近编辑
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {FILTERS.map((item) => {
          const count = item.id === "all" ? pageItems.length : counts[item.id];
          const on = filter === item.id;
          const disabled = item.id !== "all" && count === 0;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => setFilter(item.id)}
              className={`relative pb-1 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                on
                  ? "font-medium text-[#1c1917]"
                  : "text-[#78716c] hover:text-[#1c1917]"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {item.label}
                <span className="tabular-nums text-[#a8a29e]">{count}</span>
              </span>
              {on ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#1c1917]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {pageItems.length === 0 ? (
        <p className="text-sm leading-6 text-[#78716c]">
          {selectedPage != null
            ? "本页暂无笔记、标记或批注。"
            : emptyContext === "file"
              ? "本文件暂无笔记、标记或批注。"
              : "暂无最近编辑。"}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm leading-6 text-[#78716c]">该类型暂无最近编辑。</p>
      ) : (
        <div className="border-y border-[#e7e2d9]">
          <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_10.5rem] gap-4 border-b border-[#e7e2d9] py-2 text-xs text-[#78716c] sm:grid">
            <span>内容</span>
            <span className="text-right">类型</span>
            <span className="text-right">最近更新</span>
          </div>
          <ul className="divide-y divide-[#e7e2d9]">
            {filtered.map((item) => {
              const time = formatRelativeTime(item.updatedAt);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="grid grid-cols-1 gap-1 py-3 hover:bg-[#f0ebe3]/70 sm:grid-cols-[minmax(0,1fr)_7.5rem_10.5rem] sm:items-center sm:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]">
                        {item.title}
                      </span>
                      {showFileName ? (
                        <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#a8a29e]">
                          {item.fileName}
                        </span>
                      ) : null}
                    </span>
                    <span className="sm:flex sm:justify-end">
                      <span
                        className={`inline-flex whitespace-nowrap border px-1.5 py-0.5 text-xs ${RECENT_EDIT_BADGE[recentEditColor(item)]}`}
                      >
                        {item.kindLabel} · {item.typeLabel}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-xs text-[#a8a29e] sm:text-right">
                      第 {item.pageNumber} 页
                      {time ? ` · ${time}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
