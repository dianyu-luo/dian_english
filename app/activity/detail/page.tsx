import Link from "next/link";

export const metadata = {
  title: "详细数据",
  description: "单个文件的浏览详细数据",
};

type DetailPageProps = {
  searchParams: Promise<{ fileName?: string }>;
};

export default async function ActivityDetailPage({
  searchParams,
}: DetailPageProps) {
  const { fileName: raw } = await searchParams;
  const fileName = raw?.trim() || "";

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <header className="border-b border-[#e7e2d9] bg-[#faf8f4]/px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">NE</p>
          <nav className="flex items-center gap-4 text-sm text-[#78716c]">
            <Link href="/" className="hover:text-[#1c1917]">
              首页
            </Link>
            <Link href="/activity" className="hover:text-[#1c1917]">
              浏览数据
            </Link>
            <span className="text-[#1c1917]">详细数据</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">详细数据</h1>
          {fileName ? (
            <p className="max-w-xl text-base leading-7 text-[#57534e]">
              {fileName}
            </p>
          ) : null}
        </section>

        <section className="mt-12 border-t border-[#d6d3d1] pt-8">
          <p className="text-sm leading-6 text-[#78716c]">内容占位，稍后补充。</p>
        </section>
      </main>
    </div>
  );
}
