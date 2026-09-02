"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

export type PinKind = "question" | "note" | "bookmark" | "todo";

export const PIN_KINDS: readonly PinKind[] = ["note", "question", "bookmark", "todo"];

export const PINS_API = "/api/pdf/pins";

export type PdfPin = {
  id: number;
  fileName: string;
  type: PinKind;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  content: string;
};

export function pinKindLabel(kind: PinKind): string {
  switch (kind) {
    case "question":
      return "问题";
    case "note":
      return "笔记";
    case "bookmark":
      return "书签";
    case "todo":
      return "待办";
  }
}

function pinEditorTheme(kind: PinKind) {
  switch (kind) {
    case "question":
      return {
        bar: "bg-[#d97706]",
        badge: "bg-[#fffbeb] text-[#b45309] ring-1 ring-inset ring-[#fcd34d]/80",
        icon: "text-[#d97706]",
        focus:
          "focus:border-[#d97706]/70 focus:ring-2 focus:ring-[#d97706]/15",
        save: "bg-[#b45309] hover:bg-[#92400e]",
      };
    case "note":
      return {
        bar: "bg-[#64748b]",
        badge: "bg-[#f1f5f9] text-[#475569] ring-1 ring-inset ring-[#cbd5e1]/90",
        icon: "text-[#64748b]",
        focus:
          "focus:border-[#64748b]/70 focus:ring-2 focus:ring-[#64748b]/15",
        save: "bg-[#475569] hover:bg-[#334155]",
      };
    case "bookmark":
      return {
        bar: "bg-[#ea580c]",
        badge: "bg-[#fff7ed] text-[#c2410c] ring-1 ring-inset ring-[#fdba74]/80",
        icon: "text-[#ea580c]",
        focus:
          "focus:border-[#ea580c]/70 focus:ring-2 focus:ring-[#ea580c]/15",
        save: "bg-[#c2410c] hover:bg-[#9a3412]",
      };
    case "todo":
      return {
        bar: "bg-[#0f766e]",
        badge: "bg-[#f0fdfa] text-[#0f766e] ring-1 ring-inset ring-[#5eead4]/80",
        icon: "text-[#0f766e]",
        focus:
          "focus:border-[#0f766e]/70 focus:ring-2 focus:ring-[#0f766e]/15",
        save: "bg-[#0f766e] hover:bg-[#115e59]",
      };
  }
}

function PinKindIcon({ kind }: { kind: PinKind }) {
  const common = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  switch (kind) {
    case "question":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.12" />
          <path
            d="M6.35 6.2c.2-.95.95-1.55 1.9-1.55 1.05 0 1.85.65 1.85 1.6 0 .75-.4 1.2-1.05 1.55-.55.3-.8.55-.8 1.05v.25"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.35" r="0.7" fill="currentColor" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path
            d="M3 1.75h7.25L13 4.5v9.75H3V1.75Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path d="M10.25 1.75V4.5H13" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
          <path d="M5.25 7h5.5M5.25 9.5h5.5M5.25 12h3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...common}>
          <path
            d="M4 2.25h8v11.5L8 11.25 4 13.75V2.25Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.18"
          />
        </svg>
      );
    case "todo":
      return (
        <svg {...common}>
          <rect
            x="2.5"
            y="2.5"
            width="11"
            height="11"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path d="M5.2 8.1 7.1 10l3.7-4.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function pinPlaceholder(kind: PinKind) {
  switch (kind) {
    case "question":
      return "写下你的问题…";
    case "todo":
      return "记下待办事项…";
    case "bookmark":
      return "给书签加一句备注…";
    case "note":
      return "随手记一点想法…";
  }
}

function pinNoteEditorHref(opts: {
  kind: PinKind;
  id: number;
  word?: string;
  body?: string;
}) {
  const params = new URLSearchParams();
  params.set("kind", opts.kind);
  params.set("id", String(opts.id));
  const title = opts.word?.trim();
  if (title) params.set("word", title);
  if (opts.body) params.set("body", opts.body);
  return `/pdf/note?${params}`;
}

export type UsePinEditorOptions = {
  pins: PdfPin[];
  updatePins: (updater: (prev: PdfPin[]) => PdfPin[]) => void;
  onError: (message: string) => void;
  /** 打开小窗前关闭其它浮层（选区菜单、单词笔记等） */
  onBeforeOpen?: () => void;
  /** 跳转 Markdown 编辑页前关闭右键菜单等 */
  onBeforeOpenMarkdown?: () => void;
};

export type UsePinEditorResult = {
  activePin: { kind: PinKind; id: number } | null;
  activePinItem: PdfPin | null;
  pinDraft: string;
  setPinDraft: (value: string) => void;
  pinSaving: boolean;
  pinEditorRef: RefObject<HTMLDivElement | null>;
  closePinEditor: () => void;
  openPinEditor: (kind: PinKind, pin: PdfPin) => void;
  openPinMarkdownEditor: (kind: PinKind, pin: PdfPin, body?: string) => void;
  savePinContent: () => Promise<void>;
  deletePin: (kind: PinKind, pin: PdfPin) => Promise<void>;
  /** 修改 pin 类型后，保持小窗对准同一条记录 */
  retargetActivePin: (id: number, nextType: PinKind) => void;
};

export function usePinEditor({
  pins,
  updatePins,
  onError,
  onBeforeOpen,
  onBeforeOpenMarkdown,
}: UsePinEditorOptions): UsePinEditorResult {
  const router = useRouter();
  const [activePin, setActivePin] = useState<{ kind: PinKind; id: number } | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const pinEditorRef = useRef<HTMLDivElement>(null);

  const activePinItem = useMemo(() => {
    if (!activePin) return null;
    return pins.find((p) => p.id === activePin.id && p.type === activePin.kind) ?? null;
  }, [activePin, pins]);

  const closePinEditor = useCallback(() => {
    setActivePin(null);
    setPinDraft("");
  }, []);

  const openPinEditor = useCallback(
    (kind: PinKind, pin: PdfPin) => {
      onBeforeOpen?.();
      setActivePin({ kind, id: pin.id });
      setPinDraft(pin.content ?? "");
    },
    [onBeforeOpen],
  );

  const openPinMarkdownEditor = useCallback(
    (kind: PinKind, pin: PdfPin, body?: string) => {
      const href = pinNoteEditorHref({
        kind,
        id: pin.id,
        word: pinKindLabel(kind),
        body: body ?? pin.content ?? "",
      });
      closePinEditor();
      onBeforeOpenMarkdown?.();
      router.push(href);
    },
    [closePinEditor, onBeforeOpenMarkdown, router],
  );

  const savePinContent = useCallback(async () => {
    if (!activePin) return;
    setPinSaving(true);
    try {
      const res = await fetch(PINS_API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activePin.id,
          type: activePin.kind,
          content: pinDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      const item = data.item as PdfPin;
      updatePins((prev) => prev.map((p) => (p.id === item.id ? item : p)));
      closePinEditor();
    } catch (err) {
      onError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setPinSaving(false);
    }
  }, [activePin, pinDraft, closePinEditor, updatePins, onError]);

  const deletePin = useCallback(
    async (kind: PinKind, pin: PdfPin) => {
      const preview = pin.content.trim() ? `\n「${pin.content.trim().slice(0, 40)}」` : "";
      const confirmMsg = `确定删除这个${pinKindLabel(kind)}吗？${preview}`;
      const ok = window.confirm(confirmMsg);
      if (!ok) return;

      closePinEditor();
      try {
        const res = await fetch(`${PINS_API}?id=${pin.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "删除失败");
        }
        updatePins((prev) => prev.filter((row) => row.id !== pin.id));
      } catch (err) {
        onError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [closePinEditor, updatePins, onError],
  );

  const retargetActivePin = useCallback((id: number, nextType: PinKind) => {
    setActivePin((prev) => (prev?.id === id ? { kind: nextType, id } : prev));
  }, []);

  useEffect(() => {
    if (!activePin) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (pinEditorRef.current?.contains(target)) return;
      if (
        (target as Element).closest?.(
          "[data-question-marker],[data-note-marker],[data-bookmark-marker],[data-todo-marker]",
        )
      ) {
        return;
      }
      closePinEditor();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePinEditor();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePin, closePinEditor]);

  return {
    activePin,
    activePinItem,
    pinDraft,
    setPinDraft,
    pinSaving,
    pinEditorRef,
    closePinEditor,
    openPinEditor,
    openPinMarkdownEditor,
    savePinContent,
    deletePin,
    retargetActivePin,
  };
}

export type PinEditorPanelProps = {
  kind: PinKind;
  pin: PdfPin;
  draft: string;
  saving: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onExpand: () => void;
};

export function PinEditorPanel({
  kind,
  pin,
  draft,
  saving,
  editorRef,
  onDraftChange,
  onClose,
  onSave,
  onDelete,
  onExpand,
}: PinEditorPanelProps) {
  const theme = pinEditorTheme(kind);
  const flipLeft = pin.rectLeft + pin.rectWidth > 0.68;
  const dirty = draft !== (pin.content ?? "");

  return (
    <div
      ref={editorRef}
      className="absolute z-40 w-[18.5rem] overflow-hidden rounded-lg border border-[#e4dfd6] bg-[#faf8f4] shadow-[0_12px_36px_rgba(28,25,23,0.14),0_2px_6px_rgba(28,25,23,0.06)]"
      style={{
        left: flipLeft
          ? `${pin.rectLeft * 100}%`
          : `${Math.min((pin.rectLeft + pin.rectWidth) * 100, 68)}%`,
        top: `${pin.rectTop * 100}%`,
        transform: flipLeft ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={`h-0.5 w-full ${theme.bar}`} aria-hidden />
      <div className="flex items-center gap-2 border-b border-[#ebe6dc] bg-[#f7f4ee]/90 px-3 py-2 backdrop-blur-[2px]">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tracking-wide ${theme.badge}`}
        >
          <span className={theme.icon}>
            <PinKindIcon kind={kind} />
          </span>
          {pinKindLabel(kind)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-[#a8a29e]">
          第 {pin.pageNumber} 页
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#a8a29e] transition-colors hover:bg-[#efebe4] hover:text-[#1c1917]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-3 pt-3">
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (!saving) onSave();
            }
          }}
          rows={4}
          placeholder={pinPlaceholder(kind)}
          className={`min-h-[6rem] w-full resize-none rounded-md border border-[#e7e2d9] bg-white px-3 py-2.5 text-sm leading-relaxed text-[#1c1917] shadow-[inset_0_1px_2px_rgba(28,25,23,0.03)] outline-none transition-[border-color,box-shadow] placeholder:text-[#c4bfb8] ${theme.focus}`}
          autoFocus
        />
      </div>
      <div className="flex items-center gap-1 px-2.5 pt-2 pb-2.5">
        <button
          type="button"
          disabled={saving}
          onClick={onDelete}
          className="rounded-md px-2 py-1.5 text-xs text-[#b91c1c]/80 transition-colors hover:bg-[#fef2f2] hover:text-[#b91c1c] disabled:opacity-50"
        >
          删除
        </button>
        <div className="ml-auto flex items-center gap-1">
          {dirty ? (
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-[#d97706]/80" title="未保存" aria-label="未保存" />
          ) : null}
          <kbd
            className="mr-0.5 hidden rounded border border-[#e7e2d9] bg-[#f3efe8] px-1 py-0.5 font-sans text-[10px] text-[#a8a29e] sm:inline"
            title="Ctrl+Enter 保存"
          >
            ⌃↵
          </kbd>
          <button
            type="button"
            onClick={onExpand}
            title="在 Markdown 编辑器中打开"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[#78716c] transition-colors hover:bg-[#efebe4] hover:text-[#1c1917]"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M4.5 2H2.5A.5.5 0 0 0 2 2.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V7.5M7 2h3v3M5.5 6.5 10 2"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            展开
          </button>
          <button
            type="button"
            disabled={saving}
            title="Ctrl+Enter"
            onClick={onSave}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium text-[#faf8f4] shadow-sm transition-colors disabled:opacity-50 ${theme.save}`}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
