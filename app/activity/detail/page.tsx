import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ActivityDetailClient } from "./activity-detail-client";
import { formatRelativeTime } from "@/lib/activity/format-relative-time";
import {
  getFileDwellSessions,
  getFileTotalPages,
  getMonthAllDwellSlices,
} from "@/lib/activity/file-dwell";
import {
  recentEditColor,
  type RecentEditColor,
} from "@/lib/activity/recent-edit";
import { getRecentEdits } from "@/lib/activity/recent-edits";

export const metadata = {
  title: "详细数据",
  description: "单个文件的浏览详细数据",
};

const RECENT_EDIT_BADGE: Record<RecentEditColor, string> = {
  word: "border-[#facc15] bg-[#fef9c3] text-[#854d0e]",
  question: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
  note: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
  bookmark: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
  todo: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]",
  annotation: "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c]",
};

type DetailPageProps = {
  searchParams: Promise<{ fileName?: string }>;
};

export default async function ActivityDetailPage({
  searchParams,
}: DetailPageProps) {
  const { fileName: raw } = await searchParams;
  const fileName = raw?.trim() || "";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [fileSessions, monthAllSessions, recentEdits, totalPages] = fileName
    ? await Promise.all([
        getFileDwellSessions(fileName),
        getMonthAllDwellSlices(year, month),
        getRecentEdits(20, fileName),
        getFileTotalPages(fileName),
      ])
    : [[], [], [], 0];

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">详细数据</h1>
          {fileName ? (
            <p className="max-w-3xl text-base leading-7 text-[#57534e]">
              {fileName}
            </p>
          ) : (
            <p className="text-sm leading-6 text-[#78716c]">
              未指定文件。请从「浏览数据」中点击「查看」进入。
            </p>
          )}
        </section>

        {fileName ? (
          <>
            <ActivityDetailClient
              fileName={fileName}
              fileSessions={fileSessions.map((s) => ({
                startedAt: s.startedAt,
                durationMs: s.durationMs,
                pageNumber: s.pageNumber,
              }))}
              monthAllSessions={monthAllSessions}
              totalPages={totalPages}
              initialYear={year}
              initialMonth={month}
            />

            <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
              <h2 className="text-lg font-medium">最近编辑内容</h2>
              {recentEdits.length === 0 ? (
                <p className="text-sm leading-6 text-[#78716c]">
                  本文件暂无笔记、标记或批注。
                </p>
              ) : (
                <div className="border-y border-[#e7e2d9]">
                  <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_10.5rem] gap-4 border-b border-[#e7e2d9] py-2 text-xs text-[#78716c] sm:grid">
                    <span>内容</span>
                    <span className="text-right">类型</span>
                    <span className="text-right">最近更新</span>
                  </div>
                  <ul className="divide-y divide-[#e7e2d9]">
                    {recentEdits.map((item) => {
                      const time = formatRelativeTime(item.updatedAt);
                      return (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            className="grid grid-cols-1 gap-1 py-3 hover:bg-[#f0ebe3]/70 sm:grid-cols-[minmax(0,1fr)_7.5rem_10.5rem] sm:items-center sm:gap-4"
                          >
                            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]">
                              {item.title}
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
          </>
        ) : null}
      </main>
    </div>
  );
}
