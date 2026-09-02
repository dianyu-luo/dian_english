import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <header className="border-b border-[#e7e2d9] bg-[#faf8f4] px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NE</p>
          <div className="flex items-center gap-4">
            <p className="text-sm text-[#78716c]">Dashboard</p>
            <button
              type="button"
              className="border border-[#d6d3d1] bg-[#faf8f4] px-3 py-1.5 text-sm font-medium hover:bg-[#f0ebe3]"
            >
              设置
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">控制台</h1>
          <p className="max-w-xl text-base leading-7 text-[#57534e]">
            欢迎回来。这里是项目首页，后续可以把用户、数据和常用操作接到这里。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/pdf"
              className="inline-block border border-[#d6d3d1] bg-[#faf8f4] px-4 py-2 text-sm font-medium hover:bg-[#f0ebe3]"
            >
              pdf
            </Link>
            <Link
              href="/activity"
              className="inline-block border border-[#d6d3d1] bg-[#faf8f4] px-4 py-2 text-sm font-medium hover:bg-[#f0ebe3]"
            >
              浏览数据
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-3">
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">用户</p>
            <p className="mt-2 text-2xl font-medium">—</p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">今日访问</p>
            <p className="mt-2 text-2xl font-medium">—</p>
          </div>
          <div className="border-t border-[#d6d3d1] pt-4">
            <p className="text-sm text-[#78716c]">待处理</p>
            <p className="mt-2 text-2xl font-medium">—</p>
          </div>
        </section>

        <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
          <h2 className="text-lg font-medium">最近动态</h2>
          <p className="text-sm leading-6 text-[#78716c]">
            暂无数据。接入数据库后，这里会显示最近的用户变更和系统事件。
          </p>
        </section>
      </main>
    </div>
  );
}
