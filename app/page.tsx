import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { formatDurationMs } from "@/lib/activity/format-duration";
import { formatRelativeTime } from "@/lib/activity/format-relative-time";
import { getRecentFiles } from "@/lib/activity/recent-files";
import { getActivitySummary } from "@/lib/activity/summary";

export const metadata = {
  title: "NE",
  description: "英语阅读学习工作台",
};

const destinations = [
  {
    href: "/pdf",
    label: "PDF 阅读",
    hint: "打开文档，选词提问、标注与笔记",
  },
  {
    href: "/activity",
    label: "浏览数据",
    hint: "查看阅读时长、最近文件与编辑",
  },
  {
    href: "/settings",
    label: "设置",
    hint: "模型、阅读偏好与数据管理",
  },
] as const;

export default async function Home() {
  const [summary, recentFiles] = await Promise.all([
    getActivitySummary(),
    getRecentFiles(6),
  ]);

  const latest = recentFiles[0];
  const continueHref = latest
    ? `/pdf?fileName=${encodeURIComponent(latest.fileName)}`
    : "/pdf";
  const latestRelative = latest ? formatRelativeTime(latest.updatedAt) : "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f4ef] font-sans text-[#1c1917]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-28 -top-10 h-[32rem] w-[32rem] rounded-full bg-[#e4ddd2]/70 blur-3xl" />
        <div className="absolute -right-20 top-28 h-[26rem] w-[26rem] rounded-full bg-[#d5ddd8]/55 blur-3xl" />
        <div className="home-grain absolute inset-0 opacity-[0.4]" />
      </div>

      <SiteHeader />

      <main className="relative mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
        <section className="home-enter max-w-2xl space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#78716c]">
            English workspace
          </p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">NE</h1>
          <p className="text-xl font-medium tracking-tight text-[#292524] sm:text-2xl">
            读进去，留下痕迹
          </p>
          <p className="max-w-lg text-base leading-7 text-[#57534e]">
            打开 PDF，边读边问、记笔记、标重点。学习时长与进度会自动记下来，方便你随时接着读。
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={continueHref}
              className="inline-flex items-center bg-[#1c1917] px-5 py-2.5 text-sm font-medium text-[#faf8f4] transition-[transform,background-color] duration-200 hover:bg-[#292524] active:scale-[0.98]"
            >
              {latest ? "继续阅读" : "打开 PDF"}
            </Link>
            <Link
              href="/activity"
              className="inline-flex items-center border border-[#d6d3d1] bg-[#faf8f4]/80 px-5 py-2.5 text-sm font-medium text-[#1c1917] backdrop-blur-sm transition-[transform,background-color] duration-200 hover:bg-[#f0ebe3] active:scale-[0.98]"
            >
              浏览数据
            </Link>
          </div>
          {latest ? (
            <p className="text-sm text-[#78716c]">
              上次：
              <Link
                href={continueHref}
                className="ml-1 text-[#57534e] underline decoration-[#d6d3d1] underline-offset-2 transition-colors hover:text-[#1c1917]"
              >
                {latest.fileName}
              </Link>
              <span className="text-[#a8a29e]">
                {" "}
                · 第 {latest.pageNumber} 页
                {latestRelative ? ` · ${latestRelative}` : ""}
              </span>
            </p>
          ) : null}
        </section>

        <section className="home-enter home-enter-delay-1 mt-14 grid gap-6 sm:grid-cols-3">
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">今日使用时长</p>
            <p className="mt-2 text-2xl font-medium tabular-nums tracking-tight">
              {formatDurationMs(summary.todayMs)}
            </p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">本周使用时长</p>
            <p className="mt-2 text-2xl font-medium tabular-nums tracking-tight">
              {formatDurationMs(summary.weekMs)}
            </p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">访问文件数</p>
            <p className="mt-2 text-2xl font-medium tabular-nums tracking-tight">
              {summary.fileCount}
            </p>
          </div>
        </section>

        <section className="home-enter home-enter-delay-2 mt-14 space-y-4 border-t border-[#d6d3d1] pt-8">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">开始</h2>
            <p className="text-sm leading-6 text-[#78716c]">常用入口</p>
          </div>
          <div className="divide-y divide-[#e7e2d9] border-y border-[#e7e2d9]">
            {destinations.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center justify-between gap-4 py-4 transition-colors hover:bg-[#f0ebe3]/70"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#1c1917]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#a8a29e]">
                    {item.hint}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-sm text-[#a8a29e] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#1c1917]"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-enter home-enter-delay-3 mt-14 space-y-4 border-t border-[#d6d3d1] pt-8">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-medium">最近阅读</h2>
              <p className="text-sm leading-6 text-[#78716c]">从上次停下的地方继续</p>
            </div>
            {recentFiles.length > 0 ? (
              <Link
                href="/activity"
                className="shrink-0 text-sm text-[#57534e] underline decoration-[#d6d3d1] underline-offset-2 transition-colors hover:text-[#1c1917]"
              >
                全部 →
              </Link>
            ) : null}
          </div>

          {recentFiles.length === 0 ? (
            <p className="text-sm leading-6 text-[#78716c]">
              还没有打开过 PDF。先去阅读器选一个文件开始吧。
            </p>
          ) : (
            <ul className="divide-y divide-[#e7e2d9] border-y border-[#e7e2d9]">
              {recentFiles.map((item) => {
                const href = `/pdf?fileName=${encodeURIComponent(item.fileName)}`;
                const time = formatRelativeTime(item.updatedAt);
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      className="grid grid-cols-1 gap-1 py-3.5 transition-colors hover:bg-[#f0ebe3]/70 sm:grid-cols-[minmax(0,1fr)_7rem_8.5rem] sm:items-center sm:gap-4"
                    >
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]">
                        {item.fileName}
                      </span>
                      <span className="whitespace-nowrap text-xs tabular-nums text-[#57534e] sm:text-right">
                        {formatDurationMs(item.dwellMs)}
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
          )}
        </section>
      </main>
    </div>
  );
}
