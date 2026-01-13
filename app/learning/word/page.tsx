"use client";
import Link from "next/link";

import { useState, useEffect } from "react";

export default function WordLearning() {
    const [word, setWord] = useState("");
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    // 笔记列表
    const [notes, setNotes] = useState<string[]>([]);
    const [newNote, setNewNote] = useState("");
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editVal, setEditVal] = useState("");

    useEffect(() => {
        if (!word) {
            setResult(null);
            setError("");
            return;
        }
        setLoading(true);
        setError("");
        // 新增：调用后端接口记录单词查询
        if (typeof window !== 'undefined' && (window as any).electronAPI?.wordQueryRecord) {
            (window as any).electronAPI.wordQueryRecord(word).then((res: any) => {
                console.log('wordQueryRecord 返回:', res);
            });
        }
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
            .then(res => {
                if (!res.ok) throw new Error("未找到释义");
                return res.json();
            })
            .then(data => {
                setResult(data[0]);
                setError("");
            })
            .catch(e => {
                setResult(null);
                setError(e.message || "查询失败");
            })
            .finally(() => setLoading(false));
    }, [word]);

    // 新增：调用自定义IPC接口
    const callCustomIpc = async () => {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.customWordIpc) {
            try {
                const res = await (window as any).electronAPI.customWordIpc(word);
                alert('自定义IPC返回: ' + JSON.stringify(res));
            } catch (e) {
                alert('IPC调用失败: ' + (e instanceof Error ? e.message : String(e)));
            }
        } else {
            alert('electronAPI.customWordIpc 不存在');
        }
    };
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
                    {/* 新增按钮，调用自定义IPC接口 */}
                    <button
                        className="ml-2 mb-6 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                        onClick={callCustomIpc}
                        disabled={!word}
                    >测试自定义IPC</button>
                    {loading && <div className="text-blue-500 mb-4">加载中...</div>}
                    {error && <div className="text-red-500 mb-4">{error}</div>}
                    {result && (
                        <div className="mb-4" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                            <div className="flex items-center mb-2">
                                <span className="text-2xl font-bold mr-4">{result.word}</span>
                                {result.phonetics?.[0]?.text && (
                                    <span className="text-blue-600 text-lg mr-2">[{result.phonetics[0].text}]</span>
                                )}
                                {result.phonetics?.[0]?.audio && (
                                    <audio src={result.phonetics[0].audio} controls style={{ height: 28 }} />
                                )}
                            </div>
                            {result.meanings?.map((m: any, i: number) => (
                                <div key={i} className="mb-2">
                                    <div className="font-semibold text-gray-700 dark:text-gray-200">{m.partOfSpeech}</div>
                                    <ul className="list-disc ml-6 text-gray-700 dark:text-gray-300">
                                        {m.definitions?.map((d: any, j: number) => (
                                            <li key={j} className="mb-1">
                                                {d.definition}
                                                {d.example && <div className="text-sm text-gray-500 mt-1">例句: {d.example}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {/* 笔记列表 */}
                <div className="mt-8">
                    <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">单词笔记</h2>
                    <div className="flex mb-4 gap-2">
                        <input
                            type="text"
                            className="flex-1 px-3 py-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="添加新笔记..."
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && newNote.trim()) { setNotes([...notes, newNote.trim()]); setNewNote(""); } }}
                        />
                        <button
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                            onClick={() => { if (newNote.trim()) { setNotes([...notes, newNote.trim()]); setNewNote(""); } }}
                        >添加</button>
                    </div>
                    <ul className="space-y-2">
                        {notes.map((note, idx) => (
                            <li key={idx} className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700 rounded px-3 py-2">
                                {editIdx === idx ? (
                                    <>
                                        <input
                                            className="flex-1 px-2 py-1 rounded border border-gray-300"
                                            value={editVal}
                                            onChange={e => setEditVal(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { setNotes(notes.map((n, i) => i === idx ? editVal : n)); setEditIdx(null); } }}
                                            autoFocus
                                        />
                                        <button className="text-blue-600" onClick={() => { setNotes(notes.map((n, i) => i === idx ? editVal : n)); setEditIdx(null); }}>保存</button>
                                        <button className="text-gray-500" onClick={() => setEditIdx(null)}>取消</button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 break-all">{note}</span>
                                        <button className="text-blue-600" onClick={() => { setEditIdx(idx); setEditVal(note); }}>编辑</button>
                                        <button className="text-red-500" onClick={() => setNotes(notes.filter((_, i) => i !== idx))}>删除</button>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </main>
        </div>
    );
}
