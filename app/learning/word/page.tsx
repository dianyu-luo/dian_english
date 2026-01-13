"use client";
import Link from "next/link";

import { useState, useEffect } from "react";

interface NoteItem {
    id: number;
    note: string;
    editlog: string[];
}

export default function WordLearning() {
    const [word, setWord] = useState("");
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    // 笔记列表（按照接口文档格式）
    const [notes, setNotes] = useState<NoteItem[]>([]);
    const [newNote, setNewNote] = useState("");
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editVal, setEditVal] = useState("");
    const [wordId, setWordId] = useState<number | null>(null);
    const [notesLoading, setNotesLoading] = useState(false);

    // 加载单词笔记
    const loadWordNotes = async (currentWordId: number) => {
        if (typeof window === 'undefined' || !(window as any).electronAPI?.wordQueryRecord) {
            return;
        }

        setNotesLoading(true);
        try {
            // 通过查询单词来获取笔记（后端会自动创建空笔记）
            const wordRow = await (window as any).electronAPI.wordQueryRecord(word);
            if (wordRow && wordRow.notes) {
                setNotes(wordRow.notes);
            }
        } catch (e) {
            console.error('加载笔记异常:', e);
            setNotes([]);
        } finally {
            setNotesLoading(false);
        }
    };

    useEffect(() => {
        if (!word) {
            setResult(null);
            setError("");
            setWordId(null);
            setNotes([]);
            return;
        }
        setLoading(true);
        setError("");
        
        // 先查询单词释义
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
            .then(res => {
                if (!res.ok) throw new Error("未找到释义");
                return res.json();
            })
            .then(async data => {
                setResult(data[0]);
                setError("");
                
                // 查询成功后，调用后端接口记录单词查询并获取笔记
                if (typeof window !== 'undefined' && (window as any).electronAPI?.wordQueryRecord) {
                    try {
                        const res = await (window as any).electronAPI.wordQueryRecord(word);
                        console.log('wordQueryRecord 返回:', res);
                        if (res) {
                            if (res.word_id) {
                                setWordId(res.word_id);
                            }
                            if (res.notes) {
                                setNotes(res.notes);
                            }
                        }
                    } catch (e) {
                        console.error('获取笔记失败:', e);
                    }
                }
            })
            .catch(e => {
                setResult(null);
                setError(e.message || "查询失败");
                setWordId(null);
                setNotes([]);
            })
            .finally(() => setLoading(false));
    }, [word]);

    // 创建笔记
    const handleCreateNote = async () => {
        if (!newNote.trim() || !wordId) {
            return;
        }

        if (typeof window === 'undefined' || !(window as any).electronAPI?.createNote) {
            alert('Electron API 不可用');
            return;
        }

        try {
            const res = await (window as any).electronAPI.createNote(wordId, newNote.trim());
            if (res && res.notes) {
                setNotes(res.notes);
                setNewNote("");
            }
        } catch (e) {
            alert('创建笔记异常: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    // 更新笔记
    const handleUpdateNote = async (noteId: number) => {
        if (!wordId) return;

        if (typeof window === 'undefined' || !(window as any).electronAPI?.updateNote) {
            alert('Electron API 不可用');
            return;
        }

        try {
            const content = editVal.trim();
            const res = await (window as any).electronAPI.updateNote(wordId, noteId, content);
            if (res && res.notes) {
                setNotes(res.notes);
                setEditIdx(null);
            }
        } catch (e) {
            alert('更新笔记异常: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    // 删除笔记
    const handleDeleteNote = async (noteId: number) => {
        if (!wordId) return;

        if (!confirm('确定要删除这条笔记吗？')) {
            return;
        }

        if (typeof window === 'undefined' || !(window as any).electronAPI?.deleteNote) {
            alert('Electron API 不可用');
            return;
        }

        try {
            const res = await (window as any).electronAPI.deleteNote(wordId, noteId);
            if (res && res.notes) {
                setNotes(res.notes);
            }
        } catch (e) {
            alert('删除笔记异常: ' + (e instanceof Error ? e.message : String(e)));
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
                {result && (
                    <div className="mt-8 max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
                        <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">单词笔记</h2>
                        {notesLoading && <div className="text-blue-500 mb-4">加载笔记中...</div>}
                        <div className="flex mb-4 gap-2">
                            <input
                                type="text"
                                className="flex-1 px-3 py-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                placeholder="添加新笔记..."
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && newNote.trim() && wordId) { handleCreateNote(); } }}
                                disabled={!wordId || notesLoading}
                            />
                            <button
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleCreateNote}
                                disabled={!newNote.trim() || !wordId || notesLoading}
                            >添加</button>
                        </div>
                        {notes.length === 0 && !notesLoading && (
                            <div className="text-gray-500 text-center py-4">暂无笔记，添加第一条笔记吧~</div>
                        )}
                        <ul className="space-y-2">
                            {notes.map((noteItem) => (
                                <li key={noteItem.id} className="bg-gray-100 dark:bg-slate-700 rounded px-3 py-2">
                                    {editIdx === noteItem.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                className="flex-1 px-2 py-1 rounded border border-gray-300"
                                                value={editVal}
                                                onChange={e => setEditVal(e.target.value)}
                                                onKeyDown={e => { 
                                                    if (e.key === 'Enter') { 
                                                        handleUpdateNote(noteItem.id); 
                                                    } else if (e.key === 'Escape') {
                                                        setEditIdx(null);
                                                    }
                                                }}
                                                autoFocus
                                            />
                                            <button className="text-blue-600 hover:text-blue-800" onClick={() => handleUpdateNote(noteItem.id)}>保存</button>
                                            <button className="text-gray-500 hover:text-gray-700" onClick={() => setEditIdx(null)}>取消</button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`flex-1 break-all ${!noteItem.note ? 'text-gray-400 italic' : ''}`}>
                                                    {noteItem.note || '点击编辑添加笔记...'}
                                                </span>
                                                <button className="text-blue-600 hover:text-blue-800" onClick={() => { setEditIdx(noteItem.id); setEditVal(noteItem.note); }}>编辑</button>
                                                {noteItem.note && (
                                                    <button className="text-red-500 hover:text-red-700" onClick={() => handleDeleteNote(noteItem.id)}>删除</button>
                                                )}
                                            </div>
                                            {noteItem.editlog && noteItem.editlog.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                                                    <div className="text-xs text-gray-500 mb-1">编辑历史:</div>
                                                    <ul className="text-xs text-gray-400 space-y-1">
                                                        {noteItem.editlog.slice(0, 3).map((log, idx) => (
                                                            <li key={idx} className="truncate">{log || '(空)'}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </main>
        </div>
    );
}
