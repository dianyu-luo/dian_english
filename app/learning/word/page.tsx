"use client";
import Link from "next/link";

import { useState } from "react";

export default function WordLearning() {
    const [word, setWord] = useState("");
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
                    <input
                        type="text"
                        className="w-full mb-6 px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 text-lg"
                        placeholder="请输入英文单词"
                        value={word}
                        onChange={e => {
                            const val = e.target.value;
                            if (/^[a-zA-Z]*$/.test(val)) setWord(val);
                        }}
                        maxLength={32}
                        autoFocus
                    />

                </div>
            </main>
        </div>
    );
}
