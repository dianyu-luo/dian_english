import Link from "next/link";

export default function TestPage() {
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

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">测试页</h1>
          <p className="max-w-xl text-base leading-7 text-[#57534e]">
            在这里放你的测试代码。
          </p>
        </section>
      </main>
    </div>
  );
}
