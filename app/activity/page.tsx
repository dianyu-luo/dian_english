import Link from "next/link";

export const metadata = {
  title: "浏览数据",
  description: "页面使用时间、最近访问与编辑",
};

export default function ActivityPage() {
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
            查看页面使用时间、最近访问的文件，以及最近的编辑内容。功能开发中，以下为占位。
          </p>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-3">
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">今日使用时长</p>
            <p className="mt-2 text-2xl font-medium">—</p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">本周使用时长</p>
            <p className="mt-2 text-2xl font-medium">—</p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">访问文件数</p>
            <p className="mt-2 text-2xl font-medium">—</p>
          </div>
        </section>

        <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
          <h2 className="text-lg font-medium">最近访问文件</h2>
          <p className="text-sm leading-6 text-[#78716c]">暂无数据。接入后这里会列出最近打开的 PDF。</p>
        </section>

        <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
          <h2 className="text-lg font-medium">最近编辑内容</h2>
          <p className="text-sm leading-6 text-[#78716c]">
            暂无数据。接入后这里会显示笔记、标记和批注的变更。
          </p>
        </section>
      </main>
    </div>
  );
}
