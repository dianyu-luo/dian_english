import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ActivityDetailClient } from "./detail/activity-detail-client";
import { RecentEditsSection } from "./recent-edits-section";
import { formatDurationMs } from "@/lib/activity/format-duration";
import { formatRelativeTime } from "@/lib/activity/format-relative-time";
import {
  getAllDwellSessions,
  getMonthAllDwellSlices,
} from "@/lib/activity/file-dwell";
import { getRecentEdits } from "@/lib/activity/recent-edits";
import { getRecentFiles } from "@/lib/activity/recent-files";
import { getActivitySummary } from "@/lib/activity/summary";

export const metadata = {
  title: "浏览数据",
  description: "页面使用时间、最近访问与编辑",
};

export default async function ActivityPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [summary, recentFiles, recentEdits, allSessions, monthAllSessions] =
    await Promise.all([
      getActivitySummary(),
      getRecentFiles(20),
      getRecentEdits(100),
      getAllDwellSessions(),
      getMonthAllDwellSlices(year, month),
    ]);

  const fileSessions = allSessions.map((s) => ({
    startedAt: s.startedAt,
    durationMs: s.durationMs,
  }));

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">浏览数据</h1>
          <p className="max-w-xl text-base leading-7 text-[#57534e]">
            查看页面使用时间、最近访问的文件，以及最近的编辑内容。
          </p>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-3">
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">今日使用时长</p>
            <p className="mt-2 text-2xl font-medium">{formatDurationMs(summary.todayMs)}</p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">本周使用时长</p>
            <p className="mt-2 text-2xl font-medium">{formatDurationMs(summary.weekMs)}</p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">访问文件数</p>
            <p className="mt-2 text-2xl font-medium">{summary.fileCount}</p>
          </div>
        </section>

        <ActivityDetailClient
          fileSessions={fileSessions}
          monthAllSessions={monthAllSessions}
          initialYear={year}
          initialMonth={month}
        />

        <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
          <h2 className="text-lg font-medium">最近访问文件</h2>
          {recentFiles.length === 0 ? (
            <p className="text-sm leading-6 text-[#78716c]">暂无最近打开的 PDF。</p>
          ) : (
            <div className="border-y border-[#e7e2d9]">
              <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_10.5rem_5.5rem] gap-4 border-b border-[#e7e2d9] py-2 text-xs text-[#78716c] sm:grid">
                <span>文件</span>
                <span className="text-right">今日浏览</span>
                <span className="text-right">浏览时长</span>
                <span className="text-right">最近进度</span>
                <span className="text-right">详细数据</span>
              </div>
              <ul className="divide-y divide-[#e7e2d9]">
                {recentFiles.map((item) => {
                  const href = `/pdf?fileName=${encodeURIComponent(item.fileName)}`;
                  const detailHref = `/activity/detail?fileName=${encodeURIComponent(item.fileName)}`;
                  const time = formatRelativeTime(item.updatedAt);
                  return (
                    <li key={item.id}>
                      <div className="grid grid-cols-1 gap-1 py-3 hover:bg-[#f0ebe3]/70 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_10.5rem_5.5rem] sm:items-center sm:gap-4">
                        <Link
                          href={href}
                          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]"
                        >
                          {item.fileName}
                        </Link>
                        <Link
                          href={href}
                          className="whitespace-nowrap text-xs tabular-nums text-[#57534e] sm:text-right"
                        >
                          {formatDurationMs(item.todayDwellMs)}
                        </Link>
                        <Link
                          href={href}
                          className="whitespace-nowrap text-xs tabular-nums text-[#57534e] sm:text-right"
                        >
                          {formatDurationMs(item.dwellMs)}
                        </Link>
                        <Link
                          href={href}
                          className="whitespace-nowrap text-xs text-[#a8a29e] sm:text-right"
                        >
                          第 {item.pageNumber} 页
                          {time ? ` · ${time}` : ""}
                        </Link>
                        <Link
                          href={detailHref}
                          className="whitespace-nowrap text-xs text-[#57534e] underline-offset-2 hover:underline sm:text-right"
                        >
                          查看
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <RecentEditsSection
          items={recentEdits.map((item) => ({
            ...item,
            updatedAt: item.updatedAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
