/** PDF 页内标记类型注册表：新增类型主要改这里 */

export type PinKindGroup = "pin" | "todo";

export type PinEditorTheme = {
  bar: string;
  badge: string;
  icon: string;
  focus: string;
  save: string;
};

export type PinMarkerVisual = {
  empty: string;
  filled: string;
  hot: string;
  /** 页内圆标内容：文字，或交给 UI 的图标名 */
  content: { type: "text"; text: string } | { type: "icon"; name: "note" | "bookmark" | "todo" };
};

export type PinKindConfig = {
  label: string;
  placeholder: string;
  /** pin = 右键主菜单直接创建；todo = 仅出现在「待办」子菜单 */
  group: PinKindGroup;
  /** 单击是否打开编辑小窗（书签为 false） */
  clickOpensEditor: boolean;
  editor: PinEditorTheme;
  marker: PinMarkerVisual;
  recentBadge: string;
};

/** 展示与菜单顺序 */
export const PIN_KIND_ORDER = [
  "note",
  "question",
  "bookmark",
  "review",
  "todo",
  "intensive",
] as const;

export type PinKind = (typeof PIN_KIND_ORDER)[number];

export const PIN_KIND_META: Record<PinKind, PinKindConfig> = {
  note: {
    label: "笔记",
    placeholder: "随手记一点想法…",
    group: "pin",
    clickOpensEditor: true,
    editor: {
      bar: "bg-[#64748b]",
      badge: "bg-[#f1f5f9] text-[#475569] ring-1 ring-inset ring-[#cbd5e1]/90",
      icon: "text-[#64748b]",
      focus: "focus:border-[#64748b]/70 focus:ring-2 focus:ring-[#64748b]/15",
      save: "bg-[#475569] hover:bg-[#334155]",
    },
    marker: {
      empty: "border-[#a8a29e] bg-white text-[#57534e]",
      filled: "border-[#64748b] bg-[#f1f5f9] text-[#475569]",
      hot: "border-[#475569] bg-[#e2e8f0] text-[#334155]",
      content: { type: "icon", name: "note" },
    },
    recentBadge: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
  },
  question: {
    label: "问题",
    placeholder: "写下你的问题…",
    group: "pin",
    clickOpensEditor: true,
    editor: {
      bar: "bg-[#d97706]",
      badge: "bg-[#fffbeb] text-[#b45309] ring-1 ring-inset ring-[#fcd34d]/80",
      icon: "text-[#d97706]",
      focus: "focus:border-[#d97706]/70 focus:ring-2 focus:ring-[#d97706]/15",
      save: "bg-[#b45309] hover:bg-[#92400e]",
    },
    marker: {
      empty: "border-[#a8a29e] bg-white text-[#57534e]",
      filled: "border-[#d97706] bg-[#fffbeb] text-[#b45309]",
      hot: "border-[#b45309] bg-[#fef3c7] text-[#92400e]",
      content: { type: "text", text: "?" },
    },
    recentBadge: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
  },
  bookmark: {
    label: "书签",
    placeholder: "给书签加一句备注…",
    group: "pin",
    clickOpensEditor: false,
    editor: {
      bar: "bg-[#ea580c]",
      badge: "bg-[#fff7ed] text-[#c2410c] ring-1 ring-inset ring-[#fdba74]/80",
      icon: "text-[#ea580c]",
      focus: "focus:border-[#ea580c]/70 focus:ring-2 focus:ring-[#ea580c]/15",
      save: "bg-[#c2410c] hover:bg-[#9a3412]",
    },
    marker: {
      empty: "border-[#a8a29e] bg-white text-[#57534e]",
      filled: "border-[#ea580c] bg-[#fff7ed] text-[#c2410c]",
      hot: "border-[#9a3412] bg-[#ffedd5] text-[#9a3412]",
      content: { type: "icon", name: "bookmark" },
    },
    recentBadge: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
  },
  review: {
    label: "复习",
    placeholder: "记下要复习的要点…",
    group: "todo",
    clickOpensEditor: true,
    editor: {
      bar: "bg-[#7c3aed]",
      badge: "bg-[#f5f3ff] text-[#6d28d9] ring-1 ring-inset ring-[#c4b5fd]/80",
      icon: "text-[#7c3aed]",
      focus: "focus:border-[#7c3aed]/70 focus:ring-2 focus:ring-[#7c3aed]/15",
      save: "bg-[#6d28d9] hover:bg-[#5b21b6]",
    },
    marker: {
      empty: "border-[#a8a29e] bg-white text-[#57534e]",
      filled: "border-[#8b5cf6] bg-[#f5f3ff] text-[#6d28d9]",
      hot: "border-[#6d28d9] bg-[#ede9fe] text-[#5b21b6]",
      content: { type: "icon", name: "todo" },
    },
    recentBadge: "border-[#c4b5fd] bg-[#f5f3ff] text-[#6d28d9]",
  },
  todo: {
    label: "待办",
    placeholder: "记下待办事项…",
    group: "todo",
    clickOpensEditor: true,
    editor: {
      bar: "bg-[#0f766e]",
      badge: "bg-[#f0fdfa] text-[#0f766e] ring-1 ring-inset ring-[#5eead4]/80",
      icon: "text-[#0f766e]",
      focus: "focus:border-[#0f766e]/70 focus:ring-2 focus:ring-[#0f766e]/15",
      save: "bg-[#0f766e] hover:bg-[#115e59]",
    },
    marker: {
      empty: "border-[#a8a29e] bg-white text-[#57534e]",
      filled: "border-[#14b8a6] bg-[#f0fdfa] text-[#0f766e]",
      hot: "border-[#0f766e] bg-[#ccfbf1] text-[#115e59]",
      content: { type: "icon", name: "todo" },
    },
    recentBadge: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]",
  },
  intensive: {
    label: "精读",
    placeholder: "记下精读笔记…",
    group: "todo",
    clickOpensEditor: true,
    editor: {
      bar: "bg-[#2563eb]",
      badge: "bg-[#eff6ff] text-[#1d4ed8] ring-1 ring-inset ring-[#93c5fd]/80",
      icon: "text-[#2563eb]",
      focus: "focus:border-[#2563eb]/70 focus:ring-2 focus:ring-[#2563eb]/15",
      save: "bg-[#1d4ed8] hover:bg-[#1e40af]",
    },
    marker: {
      empty: "border-[#a8a29e] bg-white text-[#57534e]",
      filled: "border-[#3b82f6] bg-[#eff6ff] text-[#1d4ed8]",
      hot: "border-[#1d4ed8] bg-[#dbeafe] text-[#1e40af]",
      content: { type: "icon", name: "todo" },
    },
    recentBadge: "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]",
  },
};

export const PIN_KINDS: readonly PinKind[] = PIN_KIND_ORDER;

/** 与 PIN_KIND_META[].group === "todo" 保持一致 */
export type TodoKind = "review" | "todo" | "intensive";

export const TODO_KINDS: readonly TodoKind[] = PIN_KIND_ORDER.filter(
  (id): id is TodoKind => PIN_KIND_META[id].group === "todo",
);

/** 右键主菜单可直接添加的类型（不含待办子菜单） */
export const CONTEXT_MENU_PIN_KINDS: readonly PinKind[] = PIN_KIND_ORDER.filter(
  (id) => PIN_KIND_META[id].group === "pin",
);

const PIN_KIND_SET = new Set<string>(PIN_KINDS);
const TODO_KIND_SET = new Set<string>(TODO_KINDS);

export function isPinKind(value: string): value is PinKind {
  return PIN_KIND_SET.has(value);
}

export function isTodoKind(value: string): value is TodoKind {
  return TODO_KIND_SET.has(value);
}

export function pinKindLabel(kind: PinKind): string {
  return PIN_KIND_META[kind].label;
}

export function pinKindLabelOrFallback(type: string, fallback = "笔记"): string {
  return isPinKind(type) ? pinKindLabel(type) : fallback;
}

export function pinPlaceholder(kind: PinKind): string {
  return PIN_KIND_META[kind].placeholder;
}

export function pinEditorTheme(kind: PinKind): PinEditorTheme {
  return PIN_KIND_META[kind].editor;
}

export function pinMarkerClass(
  kind: PinKind,
  state: "empty" | "filled" | "hot",
): string {
  return PIN_KIND_META[kind].marker[state];
}

export function pinRecentBadge(kind: PinKind): string {
  return PIN_KIND_META[kind].recentBadge;
}
