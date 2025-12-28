"use client";
import Link from "next/link";

export default function WordLearning() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-slate-900 dark:to-slate-800">
      <main className="container mx-auto px-4 py-16">
        <Link 
          href="/learning" 
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-8"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回学习模式
        </Link>
        <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">单词学习</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            这里将展示单词学习相关内容。
          </p>
          {/* 你可以在这里添加单词卡片、背诵、测试等功能 */}
        </div>
      </main>
    </div>
  );
}
