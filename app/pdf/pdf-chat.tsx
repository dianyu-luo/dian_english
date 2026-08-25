"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { blobToChatImage, type ChatImage } from "./chat-image";
import { ChatContent } from "./chat-content";
import type { PdfWordSelectInfo } from "./get-selected-word";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  streaming?: boolean;
  imageUrl?: string;
};

type PdfChatProps = {
  selected: PdfWordSelectInfo | null;
  fileName?: string;
  pageNumber?: number;
};

type SseEvent =
  | { type: "start"; model?: string }
  | { type: "delta"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "done" }
  | { type: "error"; error: string };

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function welcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: "选中 PDF 文本提问，或上传 / 粘贴图片。公式会识别成 LaTeX。",
    createdAt: Date.now(),
  };
}

async function readChatStream(
  res: Response,
  onEvent: (event: SseEvent) => void,
) {
  if (!res.body) throw new Error("响应无正文");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;

      let event: SseEvent;
      try {
        event = JSON.parse(raw) as SseEvent;
      } catch {
        continue;
      }
      if (event.type === "error") {
        throw new Error(event.error || "流式输出失败");
      }
      onEvent(event);
    }
  }
}

export default function PdfChat({ selected, fileName, pageNumber }: PdfChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<ChatImage | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChatHistory = messages.some((m) => m.id !== "welcome");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageRef = useRef<ChatImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  pendingImageRef.current = pendingImage;
  /** 本轮问答：把用户发言钉在对话区顶部，流式输出期间持续对齐 */
  const pinnedUserIdRef = useRef<string | null>(null);
  const stickPinRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const userBubbleRefs = useRef(new Map<string, HTMLDivElement>());

  const pinUserToTop = useCallback((userId: string) => {
    const list = listRef.current;
    const el = userBubbleRefs.current.get(userId);
    if (!list || !el) return false;
    const delta =
      el.getBoundingClientRect().top - list.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return true;
    programmaticScrollRef.current = true;
    list.scrollTop += delta;
    // 下一帧再清标志，避免把程序滚动误判成用户上滚
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
    return true;
  }, []);

  // 发送后 + 流式生成中：每轮 DOM 更新后把用户气泡钉在可视区顶部
  useLayoutEffect(() => {
    const userId = pinnedUserIdRef.current;
    if (!userId || !stickPinRef.current) return;
    pinUserToTop(userId);
  }, [messages, sending, pinUserToTop]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const attachImage = useCallback(async (blob: Blob) => {
    setAttaching(true);
    setError(null);
    try {
      const image = await blobToChatImage(blob);
      setPendingImage(image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片处理失败");
    } finally {
      setAttaching(false);
    }
  }, []);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void attachImage(file);
  };

  const onPaste = (e: ClipboardEvent) => {
    const fileFromList = e.clipboardData?.files?.[0];
    if (fileFromList?.type.startsWith("image/")) {
      e.preventDefault();
      void attachImage(fileFromList);
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        void attachImage(file);
        return;
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) void attachImage(file);
  };

  const send = async (text: string) => {
    const content = text.trim();
    const image = pendingImageRef.current;
    if ((!content && !image) || sending || attaching) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content,
      createdAt: Date.now(),
      imageUrl: image?.previewUrl,
    };
    const assistantId = makeId();
    const nextMessages = [...messages, userMsg];
    pinnedUserIdRef.current = userMsg.id;
    stickPinRef.current = true;
    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        streaming: true,
      },
    ]);
    setDraft("");
    setPendingImage(null);
    setError(null);
    setSending(true);

    try {
      const history = nextMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          messages: history,
          images: image ? [image.dataUrl] : undefined,
          selection: selected
            ? {
                word: selected.word,
                type: selected.type,
                fileName: selected.fileName || fileName,
                pageNumber: selected.pageNumber || pageNumber,
                contextBefore: selected.contextBefore,
                contextAfter: selected.contextAfter,
              }
            : fileName
              ? { fileName, pageNumber }
              : null,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/event-stream")) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `请求失败 (${res.status})`);
      }

      let gotContent = false;
      await readChatStream(res, (event) => {
        if (event.type === "delta" && event.delta) {
          gotContent = true;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + event.delta, streaming: true }
                : m,
            ),
          );
        } else if (event.type === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m,
            ),
          );
        }
      });

      setMessages((prev) => {
        const row = prev.find((m) => m.id === assistantId);
        if (!row) return prev;
        if (!gotContent && !row.content.trim()) {
          return prev.filter((m) => m.id !== assistantId);
        }
        return prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        );
      });

      if (!gotContent) {
        throw new Error("模型未返回内容");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) =>
        prev.filter((m) => !(m.id === assistantId && !m.content.trim())),
      );
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      const id = pinnedUserIdRef.current;
      const shouldPin = stickPinRef.current && id;
      setSending(false);
      // 收尾再钉一次（markdown 终态布局），再解除跟随
      if (shouldPin && id) {
        requestAnimationFrame(() => {
          pinUserToTop(id);
          stickPinRef.current = false;
          pinnedUserIdRef.current = null;
        });
      } else {
        stickPinRef.current = false;
        pinnedUserIdRef.current = null;
      }
      inputRef.current?.focus();
    }
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

  const clearChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    stickPinRef.current = false;
    pinnedUserIdRef.current = null;
    setSending(false);
    setError(null);
    setMessages([welcomeMessage()]);
  };

  const deleteMessage = (id: string) => {
    if (id === "welcome") return;
    const target = messages.find((m) => m.id === id);
    if (target?.streaming) {
      abortRef.current?.abort();
      abortRef.current = null;
      stickPinRef.current = false;
      pinnedUserIdRef.current = null;
      setSending(false);
    }
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setError(null);
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[#faf8f4]"
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {selected ? (
        <div className="shrink-0 border-b border-[#e7e2d9] bg-[#f6f4ef] px-4 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] tracking-wide text-[#a8a29e] uppercase">
                {selected.type === "sentence" ? "选中句子" : "选中单词"}
              </p>
              <p className="mt-1 line-clamp-3 text-sm leading-5 text-[#1c1917]">{selected.word}</p>
            </div>
            {hasChatHistory ? (
              <button
                type="button"
                onClick={clearChat}
                className="shrink-0 border border-[#d6d3d1] bg-white px-2 py-0.5 text-xs text-[#57534e] hover:bg-[#f0ebe3]"
              >
                清空
              </button>
            ) : null}
          </div>
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
            <button
              type="button"
              onClick={() => {
                if (!selected) return;
                router.push(`/pdf/note?word=${encodeURIComponent(selected.word)}`);
              }}
              className="border border-[#d6d3d1] bg-white px-2 py-0.5 text-xs text-[#57534e] hover:bg-[#f0ebe3]"
            >
              笔记
            </button>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e7e2d9] px-4 py-2.5">
          <p className="min-w-0 truncate text-xs text-[#78716c]">
            {fileName
              ? `${fileName}${pageNumber != null ? ` · 第 ${pageNumber} 页` : ""}`
              : "选中文本后可快捷提问"}
          </p>
          {hasChatHistory ? (
            <button
              type="button"
              onClick={clearChat}
              className="shrink-0 border border-[#d6d3d1] bg-white px-2 py-0.5 text-xs text-[#57534e] hover:bg-[#f0ebe3]"
            >
              清空
            </button>
          ) : null}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={() => {
          if (programmaticScrollRef.current || !stickPinRef.current) return;
          const userId = pinnedUserIdRef.current;
          const list = listRef.current;
          const el = userId ? userBubbleRefs.current.get(userId) : null;
          if (!list || !el) return;
          const delta =
            el.getBoundingClientRect().top - list.getBoundingClientRect().top;
          // 用户手动上/下滚离开顶部钉住位置时，停止自动跟随
          if (Math.abs(delta) > 48) {
            stickPinRef.current = false;
          }
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 [overflow-anchor:none]"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            ref={
              m.role === "user"
                ? (node) => {
                    if (node) userBubbleRefs.current.set(m.id, node);
                    else userBubbleRefs.current.delete(m.id);
                  }
                : undefined
            }
            className={`group flex items-start gap-1.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.id !== "welcome" && m.role === "user" ? (
              <button
                type="button"
                onClick={() => deleteMessage(m.id)}
                className="mt-1 shrink-0 border border-transparent px-1.5 py-0.5 text-[11px] text-[#a8a29e] opacity-0 transition-opacity hover:border-[#d6d3d1] hover:bg-white hover:text-[#57534e] group-hover:opacity-100 focus:opacity-100"
                aria-label="删除这条消息"
              >
                删除
              </button>
            ) : null}
            <div
              className={`max-w-[92%] px-3 py-2 text-sm ${
                m.role === "user"
                  ? "leading-6 whitespace-pre-wrap bg-[#1c1917] text-[#faf8f4]"
                  : "overflow-visible border border-[#e7e2d9] bg-white leading-normal text-[#292524]"
              }`}
            >
              {m.role === "assistant" ? (
                <ChatContent content={m.content} streaming={m.streaming} />
              ) : (
                <>
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt="上传的图片"
                      className={`max-h-40 max-w-full object-contain ${m.content ? "mb-2" : ""}`}
                    />
                  ) : null}
                  {m.content ? m.content : !m.imageUrl ? null : (
                    <span className="text-xs text-[#a8a29e]">识别图片</span>
                  )}
                </>
              )}
            </div>
            {m.id !== "welcome" && m.role === "assistant" ? (
              <button
                type="button"
                onClick={() => deleteMessage(m.id)}
                className="mt-1 shrink-0 border border-transparent px-1.5 py-0.5 text-[11px] text-[#a8a29e] opacity-0 transition-opacity hover:border-[#d6d3d1] hover:bg-white hover:text-[#57534e] group-hover:opacity-100 focus:opacity-100"
                aria-label="删除这条消息"
              >
                删除
              </button>
            ) : null}
          </div>
        ))}
        {error ? <p className="text-sm text-[#b91c1c]">{error}</p> : null}
      </div>

      <form
        onSubmit={onSubmit}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="shrink-0 border-t border-[#e7e2d9] p-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
        {pendingImage ? (
          <div className="relative mb-2 inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage.previewUrl}
              alt="待发送图片"
              className="max-h-28 max-w-full border border-[#d6d3d1] object-contain"
            />
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="absolute top-1 right-1 border border-[#d6d3d1] bg-white px-1.5 py-0.5 text-[11px] text-[#57534e] hover:bg-[#f0ebe3]"
            >
              移除
            </button>
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={
            pendingImage
              ? "补充问题（可空，直接发送即 OCR，公式转 LaTeX）"
              : selected
                ? `问关于「${selected.word.slice(0, 24)}」…`
                : "输入问题，或粘贴 / 上传图片"
          }
          className="w-full resize-none border border-[#d6d3d1] bg-white px-3 py-2 text-sm text-[#1c1917] outline-none placeholder:text-[#a8a29e] focus:border-[#a8a29e]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              disabled={sending || attaching}
              onClick={() => fileInputRef.current?.click()}
              className="border border-[#d6d3d1] bg-white px-2 py-1 text-xs text-[#57534e] hover:bg-[#f0ebe3] disabled:opacity-50"
            >
              图片
            </button>
            <p className="truncate text-[11px] text-[#a8a29e]">
              {attaching ? "处理图片中…" : "Enter 发送 · 可粘贴图片"}
            </p>
          </div>
          <button
            type="submit"
            disabled={sending || attaching || (!draft.trim() && !pendingImage)}
            className="shrink-0 border border-[#d6d3d1] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f0ebe3] disabled:opacity-40"
          >
            {sending ? "生成中…" : "发送"}
          </button>
        </div>
      </form>
    </div>
  );
}
