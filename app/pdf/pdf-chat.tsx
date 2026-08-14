"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { PdfWordSelectInfo } from "./get-selected-word";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

type PdfChatProps = {
  selected: PdfWordSelectInfo | null;
  fileName?: string;
  pageNumber?: number;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stubReply(userText: string, selected: PdfWordSelectInfo | null): string {
  const focus = selected?.word?.trim();
  if (focus) {
    return [
      `关于「${focus}」：`,
      "",
      "目前聊天接口尚未接入模型，这里先占位回复。",
      `你可以继续提问，例如：解释含义、同义词、或用它造句。`,
      "",
      `你的问题：${userText}`,
    ].join("\n");
  }
  return [
    "目前聊天接口尚未接入模型，这里先占位回复。",
    "在 PDF 中选中单词或句子后提问，会带上当前选区上下文。",
    "",
    `你说：${userText}`,
  ].join("\n");
}

export default function PdfChat({ selected, fileName, pageNumber }: PdfChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "选中 PDF 里的单词或句子，然后在这里提问——解释、用法、造句都可以。",
      createdAt: Date.now(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);

    // 占位：后续接 /api/chat 流式回复
    await new Promise((r) => setTimeout(r, 280));
    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        role: "assistant",
        content: stubReply(content, selected),
        createdAt: Date.now(),
      },
    ]);
    setSending(false);
    inputRef.current?.focus();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  const askAboutSelection = (prompt: string) => {
    if (!selected) return;
    void send(`${prompt}：${selected.word}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#faf8f4]">
      {selected ? (
        <div className="shrink-0 border-b border-[#e7e2d9] bg-[#f6f4ef] px-4 py-2.5">
          <p className="text-[11px] tracking-wide text-[#a8a29e] uppercase">
            {selected.type === "sentence" ? "选中句子" : "选中单词"}
          </p>
          <p className="mt-1 line-clamp-3 text-sm leading-5 text-[#1c1917]">{selected.word}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["解释含义", "用法例句", "同义词"] as const).map((label) => (
              <button
                key={label}
                type="button"
                disabled={sending}
                onClick={() => askAboutSelection(label)}
                className="border border-[#d6d3d1] bg-white px-2 py-0.5 text-xs text-[#57534e] hover:bg-[#f0ebe3] disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-b border-[#e7e2d9] px-4 py-2.5">
          <p className="text-xs text-[#78716c]">
            {fileName
              ? `${fileName}${pageNumber != null ? ` · 第 ${pageNumber} 页` : ""}`
              : "选中文本后可快捷提问"}
          </p>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] whitespace-pre-wrap px-3 py-2 text-sm leading-6 ${
                m.role === "user"
                  ? "bg-[#1c1917] text-[#faf8f4]"
                  : "border border-[#e7e2d9] bg-white text-[#292524]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending ? (
          <div className="flex justify-start">
            <div className="border border-[#e7e2d9] bg-white px-3 py-2 text-sm text-[#a8a29e]">
              思考中…
            </div>
          </div>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-[#e7e2d9] p-3">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={selected ? `问关于「${selected.word.slice(0, 24)}」…` : "输入问题，Enter 发送"}
          className="w-full resize-none border border-[#d6d3d1] bg-white px-3 py-2 text-sm text-[#1c1917] outline-none placeholder:text-[#a8a29e] focus:border-[#a8a29e]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#a8a29e]">Enter 发送 · Shift+Enter 换行</p>
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="border border-[#d6d3d1] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
