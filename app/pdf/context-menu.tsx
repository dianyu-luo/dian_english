"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  PIN_KINDS,
  pinKindLabel,
  type PdfPin,
  type PinKind,
  type TodoKind,
} from "./pin-editor";

export type AnnotateToolId = "arrow" | "circle" | "rect";

export type ContextMenuRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ContextMenuState = {
  x: number;
  y: number;
  pageNumber: number;
  rect: ContextMenuRect;
};

export type MarkerMenuState<A = { id: number }> =
  | { x: number; y: number; kind: PinKind; pin: PdfPin }
  | { x: number; y: number; kind: "arrow"; annotation: A };

const LAST_ANNOTATE_TOOL_KEY = "pdf-last-annotate-tool";
const LAST_TODO_KIND_KEY = "pdf-last-todo-kind";
const SUBMENU_CLOSE_MS = 180;
const PAGE_MENU_W = 140;
const PAGE_MENU_H = 160;

function clampMenuPosition(clientX: number, clientY: number, menuW: number, menuH: number) {
  const x = Math.min(clientX, window.innerWidth - menuW - 8);
  const y = Math.min(clientY, window.innerHeight - menuH - 8);
  return { x: Math.max(8, x), y: Math.max(8, y) };
}

function submenuOpensLeft(x: number) {
  if (typeof window === "undefined") return false;
  return x + PAGE_MENU_W + 120 > window.innerWidth - 8;
}

function readLastAnnotateTool(): AnnotateToolId | null {
  try {
    const value = localStorage.getItem(LAST_ANNOTATE_TOOL_KEY);
    if (value === "arrow" || value === "circle" || value === "rect") return value;
  } catch {
    // ignore
  }
  return null;
}

function writeLastAnnotateTool(tool: AnnotateToolId) {
  try {
    localStorage.setItem(LAST_ANNOTATE_TOOL_KEY, tool);
  } catch {
    // ignore
  }
}

function readLastTodoKind(): TodoKind | null {
  try {
    const value = localStorage.getItem(LAST_TODO_KIND_KEY);
    if (value === "review" || value === "todo" || value === "intensive") return value;
  } catch {
    // ignore
  }
  return null;
}

function writeLastTodoKind(kind: TodoKind) {
  try {
    localStorage.setItem(LAST_TODO_KIND_KEY, kind);
  } catch {
    // ignore
  }
}

function AnnotateArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 14.5 14.5 3.5M14.5 3.5H7.5M14.5 3.5V10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnnotateCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function AnnotateRectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="4.5"
        width="11"
        height="9"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AnnotateToolIcon({ tool }: { tool: AnnotateToolId }) {
  if (tool === "arrow") return <AnnotateArrowIcon />;
  if (tool === "circle") return <AnnotateCircleIcon />;
  return <AnnotateRectIcon />;
}

function ReviewMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M12.4 6.2A4.6 4.6 0 0 0 3.8 7.4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M12.4 6.2 10.7 4.4M12.4 6.2 10.6 7.8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M3.6 9.8A4.6 4.6 0 0 0 12.2 8.6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M3.6 9.8 5.3 11.6M3.6 9.8 5.4 8.2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TodoMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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
      <path
        d="M5.2 8.1 7.1 10l3.7-4.2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IntensiveMarkerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 3.75h5c.85 0 1.6.35 2 .9  .4-.55 1.15-.9 2-.9h4.5v8.5h-4.5c-.85 0-1.6.3-2 .85-.4-.55-1.15-.85-2-.85h-5V3.75Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M8 4.7v8.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function TodoKindIcon({ kind }: { kind: TodoKind }) {
  if (kind === "review") return <ReviewMarkerIcon />;
  if (kind === "intensive") return <IntensiveMarkerIcon />;
  return <TodoMarkerIcon />;
}

const CONTEXT_MENU_ITEMS = [
  { id: "note", label: "笔记" },
  { id: "question", label: "问题" },
  { id: "bookmark", label: "书签" },
  { id: "todo", label: "待办" },
  { id: "annotate", label: "标注" },
  { id: "help", label: "帮助" },
] as const;

const ANNOTATE_SUBMENU_ITEMS = [
  { id: "arrow", label: "箭头", Icon: AnnotateArrowIcon },
  { id: "circle", label: "圆形", Icon: AnnotateCircleIcon },
  { id: "rect", label: "矩形", Icon: AnnotateRectIcon },
] as const;

const TODO_SUBMENU_ITEMS = [
  { id: "review", label: "复习", Icon: ReviewMarkerIcon },
  { id: "todo", label: "待办", Icon: TodoMarkerIcon },
  { id: "intensive", label: "精读", Icon: IntensiveMarkerIcon },
] as const;

function useDismissFloating(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose, ref]);
}

function useSubmenuCloseTimer() {
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const schedule = useCallback(
    (fn: () => void) => {
      clear();
      timerRef.current = window.setTimeout(() => {
        fn();
        timerRef.current = null;
      }, SUBMENU_CLOSE_MS);
    },
    [clear],
  );

  return { clear, schedule };
}

export function usePdfContextMenus<A = { id: number }>() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenuState<A> | null>(null);
  const [lastAnnotateTool, setLastAnnotateTool] = useState<AnnotateToolId | null>(null);
  const [lastTodoKind, setLastTodoKind] = useState<TodoKind | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const markerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastAnnotateTool(readLastAnnotateTool());
    setLastTodoKind(readLastTodoKind());
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeMarkerMenu = useCallback(() => {
    setMarkerMenu(null);
  }, []);

  const openPageContextMenu = useCallback(
    (e: MouseEvent, payload: { pageNumber: number; rect: ContextMenuRect }) => {
      e.preventDefault();
      closeMarkerMenu();
      const { x, y } = clampMenuPosition(e.clientX, e.clientY, PAGE_MENU_W, PAGE_MENU_H);
      setContextMenu({
        x,
        y,
        pageNumber: payload.pageNumber,
        rect: payload.rect,
      });
    },
    [closeMarkerMenu],
  );

  const openMarkerMenu = useCallback(
    (
      e: MouseEvent,
      target:
        | { kind: PinKind; pin: PdfPin }
        | { kind: "arrow"; annotation: A },
    ) => {
      e.preventDefault();
      e.stopPropagation();
      closeContextMenu();
      const isPin = target.kind !== "arrow";
      const menuW = isPin ? 132 : 120;
      const menuH = isPin ? 72 : 48;
      const { x, y } = clampMenuPosition(e.clientX, e.clientY, menuW, menuH);
      setMarkerMenu({
        x,
        y,
        ...target,
      });
    },
    [closeContextMenu],
  );

  const rememberAnnotateTool = useCallback((tool: AnnotateToolId) => {
    setLastAnnotateTool(tool);
    writeLastAnnotateTool(tool);
  }, []);

  const rememberTodoKind = useCallback((kind: TodoKind) => {
    setLastTodoKind(kind);
    writeLastTodoKind(kind);
  }, []);

  useDismissFloating(Boolean(contextMenu), contextMenuRef, closeContextMenu);
  useDismissFloating(Boolean(markerMenu), markerMenuRef, closeMarkerMenu);

  return {
    contextMenu,
    markerMenu,
    contextMenuRef,
    markerMenuRef,
    closeContextMenu,
    closeMarkerMenu,
    openPageContextMenu,
    openMarkerMenu,
    lastAnnotateTool,
    lastTodoKind,
    rememberAnnotateTool,
    rememberTodoKind,
  };
}

export type PdfPageContextMenuProps = {
  menu: ContextMenuState;
  menuRef: RefObject<HTMLDivElement | null>;
  lastAnnotateTool: AnnotateToolId | null;
  lastTodoKind: TodoKind | null;
  onAddPin: (kind: PinKind) => void;
  onSelectAnnotateTool: (tool: AnnotateToolId) => void;
  onSelectTodoKind: (kind: TodoKind) => void;
  onClose: () => void;
};

export function PdfPageContextMenu({
  menu,
  menuRef,
  lastAnnotateTool,
  lastTodoKind,
  onAddPin,
  onSelectAnnotateTool,
  onSelectTodoKind,
  onClose,
}: PdfPageContextMenuProps) {
  const [annotateSubmenuOpen, setAnnotateSubmenuOpen] = useState(false);
  const [todoSubmenuOpen, setTodoSubmenuOpen] = useState(false);
  const { clear, schedule } = useSubmenuCloseTimer();

  useEffect(() => {
    clear();
    setAnnotateSubmenuOpen(false);
    setTodoSubmenuOpen(false);
  }, [menu.x, menu.y, menu.pageNumber, clear]);

  const annotateSubmenuOnLeft = useMemo(() => submenuOpensLeft(menu.x), [menu.x]);
  const todoSubmenuOnLeft = useMemo(() => submenuOpensLeft(menu.x), [menu.x]);

  const openSubmenu = (which: "todo" | "annotate") => {
    clear();
    setTodoSubmenuOpen(which === "todo");
    setAnnotateSubmenuOpen(which === "annotate");
  };

  const scheduleCloseSubmenu = (which: "todo" | "annotate") => {
    schedule(() => {
      if (which === "todo") setTodoSubmenuOpen(false);
      else setAnnotateSubmenuOpen(false);
    });
  };

  const dismissSubmenus = () => {
    clear();
    setTodoSubmenuOpen(false);
    setAnnotateSubmenuOpen(false);
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[8.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      {CONTEXT_MENU_ITEMS.map((item) =>
        item.id === "annotate" ? (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => openSubmenu("annotate")}
            onMouseLeave={() => scheduleCloseSubmenu("annotate")}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={annotateSubmenuOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
              onClick={() => {
                if (lastAnnotateTool) {
                  onSelectAnnotateTool(lastAnnotateTool);
                  return;
                }
                openSubmenu("annotate");
              }}
            >
              <span className="flex items-center gap-2">
                <span>{item.label}</span>
                {lastAnnotateTool ? (
                  <span className="inline-flex text-[#78716c]" title="上次工具" aria-hidden>
                    <AnnotateToolIcon tool={lastAnnotateTool} />
                  </span>
                ) : null}
              </span>
              <span className="text-[#a8a29e]" aria-hidden>
                ›
              </span>
            </button>
            {annotateSubmenuOpen ? (
              <div
                className={`absolute top-0 z-50 ${
                  annotateSubmenuOnLeft ? "right-full pr-1.5" : "left-full pl-1.5"
                }`}
              >
                <div
                  role="menu"
                  className="flex border border-[#d6d3d1] bg-[#faf8f4] p-0.5 shadow-md"
                >
                  {ANNOTATE_SUBMENU_ITEMS.map((sub) => {
                    const Icon = sub.Icon;
                    const active = lastAnnotateTool === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitem"
                        title={sub.label}
                        aria-label={sub.label}
                        aria-current={active ? "true" : undefined}
                        className={`flex h-8 w-8 items-center justify-center text-[#1c1917] hover:bg-[#efebe4] ${
                          active ? "bg-[#efebe4] ring-1 ring-inset ring-[#a8a29e]" : ""
                        }`}
                        onClick={() => onSelectAnnotateTool(sub.id)}
                      >
                        <Icon />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : item.id === "todo" ? (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => openSubmenu("todo")}
            onMouseLeave={() => scheduleCloseSubmenu("todo")}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={todoSubmenuOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
              onClick={() => {
                if (lastTodoKind) {
                  onSelectTodoKind(lastTodoKind);
                  return;
                }
                openSubmenu("todo");
              }}
            >
              <span className="flex items-center gap-2">
                <span>{item.label}</span>
                {lastTodoKind ? (
                  <span className="inline-flex text-[#78716c]" title="上次类型" aria-hidden>
                    <TodoKindIcon kind={lastTodoKind} />
                  </span>
                ) : null}
              </span>
              <span className="text-[#a8a29e]" aria-hidden>
                ›
              </span>
            </button>
            {todoSubmenuOpen ? (
              <div
                className={`absolute top-0 z-50 ${
                  todoSubmenuOnLeft ? "right-full pr-1.5" : "left-full pl-1.5"
                }`}
              >
                <div
                  role="menu"
                  className="min-w-[6.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
                >
                  {TODO_SUBMENU_ITEMS.map((sub) => {
                    const Icon = sub.Icon;
                    const active = lastTodoKind === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitem"
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4] ${
                          active ? "bg-[#efebe4]" : ""
                        }`}
                        onClick={() => onSelectTodoKind(sub.id)}
                      >
                        <span className="inline-flex text-[#57534e]" aria-hidden>
                          <Icon />
                        </span>
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
            onMouseEnter={dismissSubmenus}
            onClick={() => {
              if (item.id === "question" || item.id === "note" || item.id === "bookmark") {
                onAddPin(item.id);
                return;
              }
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export type PdfMarkerMenuProps<A = { id: number }> = {
  menu: MarkerMenuState<A>;
  menuRef: RefObject<HTMLDivElement | null>;
  onChangePinType: (pin: PdfPin, next: PinKind) => void;
  onDelete: () => void;
};

export function PdfMarkerMenu<A>({
  menu,
  menuRef,
  onChangePinType,
  onDelete,
}: PdfMarkerMenuProps<A>) {
  const [pinTypeSubmenuOpen, setPinTypeSubmenuOpen] = useState(false);
  const { clear, schedule } = useSubmenuCloseTimer();

  useEffect(() => {
    clear();
    setPinTypeSubmenuOpen(false);
  }, [menu.x, menu.y, menu.kind, clear]);

  const pinTypeSubmenuOnLeft = useMemo(() => submenuOpensLeft(menu.x), [menu.x]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[7.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.kind !== "arrow" ? (
        <>
          <div
            className="relative"
            onMouseEnter={() => {
              clear();
              setPinTypeSubmenuOpen(true);
            }}
            onMouseLeave={() => schedule(() => setPinTypeSubmenuOpen(false))}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={pinTypeSubmenuOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
              onClick={() => setPinTypeSubmenuOpen((open) => !open)}
            >
              <span>更改类型</span>
              <span className="text-[#a8a29e]" aria-hidden>
                ›
              </span>
            </button>
            {pinTypeSubmenuOpen ? (
              <div
                className={`absolute top-0 z-50 ${
                  pinTypeSubmenuOnLeft ? "right-full pr-1.5" : "left-full pl-1.5"
                }`}
              >
                <div
                  role="menu"
                  className="min-w-[6.5rem] border border-[#d6d3d1] bg-[#faf8f4] py-1 shadow-md"
                >
                  {PIN_KINDS.filter((k) => k !== menu.kind).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-1.5 text-left text-sm text-[#1c1917] hover:bg-[#efebe4]"
                      onClick={() => onChangePinType(menu.pin, k)}
                    >
                      {pinKindLabel(k)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="my-1 border-t border-[#e7e2d9]" role="separator" />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-sm text-[#b91c1c] hover:bg-[#fee2e2]"
        onClick={onDelete}
      >
        删除
      </button>
    </div>
  );
}
