"use client";

import Link from "next/link";
import { useState } from "react";

export default function TestPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"file" | "hello" | null>(null);

  async function handleCreateFile() {
    setLoading("file");
    setMessage("");
    try {
      const res = await fetch("/api/test/create-file", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "创建失败");
      }
      setMessage(`已生成：tmp/${data.filename}（数据库 id=${data.id}）`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(null);
    }
  }

  async function handleHelloTest() {
    setLoading("hello");
    setMessage("");
    try {
      const res = await fetch("/api/test/hello", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "写入失败");
      }
      setMessage(
        `hello_test：id=${data.id}，uuid=${data.uuid}，time=${data.createdAt}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "写入失败");
    } finally {
      setLoading(null);
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
            测试写文件与写入 SQLite（data/app.db）。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCreateFile}
              disabled={loading !== null}
              className="border border-[#d6d3d1] bg-[#faf8f4] px-4 py-2 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
            >
              {loading === "file" ? "生成中…" : "生成文件"}
            </button>
            <button
              type="button"
              onClick={handleHelloTest}
              disabled={loading !== null}
              className="border border-[#d6d3d1] bg-[#faf8f4] px-4 py-2 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-50"
            >
              {loading === "hello" ? "写入中…" : "写入 hello_test"}
            </button>
          </div>
          {message ? (
            <p className="text-sm text-[#57534e]">{message}</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
