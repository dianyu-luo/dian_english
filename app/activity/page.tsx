import Link from "next/link";
import { formatDurationMs } from "@/lib/activity/format-duration";
import { formatRelativeTime } from "@/lib/activity/format-relative-time";
import {
  recentEditColor,
  type RecentEditColor,
} from "@/lib/activity/recent-edit";
import { getRecentEdits } from "@/lib/activity/recent-edits";
import { getRecentFiles } from "@/lib/activity/recent-files";
import { getActivitySummary } from "@/lib/activity/summary";

const RECENT_EDIT_BADGE: Record<RecentEditColor, string> = {
  word: "border-[#facc15] bg-[#fef9c3] text-[#854d0e]",
  question: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
  note: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
  bookmark: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
  todo: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]",
  annotation: "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c]",
};

export const metadata = {
  title: "浏览数据",
  description: "页面使用时间、最近访问与编辑",
};

export default async function ActivityPage() {
  const [summary, recentFiles, recentEdits] = await Promise.all([
    getActivitySummary(),
    getRecentFiles(20),
    getRecentEdits(20),
  ]);

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <header className="border-b border-[#e7e2d9] bg-[#faf8f4]/px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NE</p>
          <nav className="flex items-center gap-4 text-sm text-[#78716c]">
            <Link href="/" className="hover:text-[#1c1917]">
              首页
            </Link>
            <span className="text-[#1c1917]">浏览数据</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
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
                  const time = formatRelativeTime(item.updatedAt);
                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        className="grid grid-cols-1 gap-1 py-3 hover:bg-[#f0ebe3]/70 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_10.5rem_5.5rem] sm:items-center sm:gap-4"
                      >
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]">
                          {item.fileName}
                        </span>
                        <span className="whitespace-nowrap text-xs tabular-nums text-[#57534e] sm:text-right">
                          {formatDurationMs(item.todayDwellMs)}
                        </span>
                        <span className="whitespace-nowrap text-xs tabular-nums text-[#57534e] sm:text-right">
                          {formatDurationMs(item.dwellMs)}
                        </span>
                        <span className="whitespace-nowrap text-xs text-[#a8a29e] sm:text-right">
                          第 {item.pageNumber} 页
                          {time ? ` · ${time}` : ""}
                        </span>
                        <span className="whitespace-nowrap text-xs text-[#57534e] sm:text-right">
                          查看
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
          <h2 className="text-lg font-medium">最近编辑内容</h2>
          {recentEdits.length === 0 ? (
            <p className="text-sm leading-6 text-[#78716c]">
              暂无数据。接入后这里会显示笔记、标记和批注的变更。
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
                        <span className="min-w-0">
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#a8a29e]">
                            {item.fileName}
                          </span>
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
      </main>
    </div>
  );
}
