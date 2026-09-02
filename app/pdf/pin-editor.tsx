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
        badge: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
        accent: "border-t-[#d97706]",
        focus: "focus:border-[#d97706]",
      };
    case "note":
      return {
        badge: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
        accent: "border-t-[#64748b]",
        focus: "focus:border-[#64748b]",
      };
    case "bookmark":
      return {
        badge: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
        accent: "border-t-[#ea580c]",
        focus: "focus:border-[#ea580c]",
      };
    case "todo":
      return {
        badge: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]",
        accent: "border-t-[#0f766e]",
        focus: "focus:border-[#0f766e]",
      };
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

  return (
    <div
      ref={editorRef}
      className={`absolute z-40 w-72 overflow-hidden border border-[#e7e2d9] border-t-2 bg-[#faf8f4] shadow-[0_10px_28px_rgba(28,25,23,0.12)] ${theme.accent}`}
      style={{
        left: `${Math.min((pin.rectLeft + pin.rectWidth) * 100, 68)}%`,
        top: `${pin.rectTop * 100}%`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-[#e7e2d9] bg-[#f6f4ef] px-3 py-2">
        <span
          className={`inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium ${theme.badge}`}
        >
          {pinKindLabel(kind)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[#a8a29e]">
          第 {pin.pageNumber} 页
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-[#a8a29e] hover:bg-[#efebe4] hover:text-[#1c1917]"
        >
          ×
        </button>
      </div>
      <div className="px-3 pt-2.5">
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
          placeholder={
            kind === "question" ? "输入问题…" : kind === "todo" ? "输入待办…" : "输入笔记…"
          }
          className={`min-h-[5.5rem] w-full resize-none border border-[#e7e2d9] bg-white px-2.5 py-2 text-sm leading-relaxed text-[#1c1917] outline-none placeholder:text-[#a8a29e] ${theme.focus}`}
          autoFocus
        />
      </div>
      <div className="flex items-center gap-1 px-2.5 py-2">
        <button
          type="button"
          disabled={saving}
          onClick={onDelete}
          className="px-2 py-1 text-xs text-[#b91c1c] hover:bg-[#fee2e2] disabled:opacity-50"
        >
          删除
        </button>
        <span className="ml-auto text-[10px] text-[#c4bfb8]" title="Ctrl+Enter">
          ⌃↵
        </span>
        <button
          type="button"
          onClick={onExpand}
          className="px-2 py-1 text-xs text-[#78716c] hover:bg-[#efebe4] hover:text-[#1c1917]"
        >
          展开
        </button>
        <button
          type="button"
          disabled={saving}
          title="Ctrl+Enter"
          onClick={onSave}
          className="border border-[#d6d3d1] bg-[#1c1917] px-2.5 py-1 text-xs font-medium text-[#faf8f4] hover:bg-[#292524] disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
