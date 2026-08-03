"use client";

import Link from "next/link";
import { useState } from "react";

export default function TestPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateFile() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/test/create-file", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "创建失败");
      }
      setMessage(`已生成：tmp/${data.filename}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

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
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">测试页</h1>
          <p className="max-w-xl text-base leading-7 text-[#57534e]">
            点击按钮会在项目根目录的 tmp/ 下生成一个以时间戳命名的文件。
          </p>
          <button
            type="button"
            onClick={handleCreateFile}
            disabled={loading}
            className="border border-[#d6d3d1] bg-[#faf8f4] px-4 py-2 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
          >
            {loading ? "生成中…" : "生成文件"}
          </button>
          {message ? (
            <p className="text-sm text-[#57534e]">{message}</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
