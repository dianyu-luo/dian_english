"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  buildOutlineTree,
  collectAncestorIds,
  findActiveOutlineId,
  type OutlineTreeNode,
} from "@/lib/pdf/outline-tree";

type OutlineStatus = "loading" | "ready" | "empty" | "error";

type PdfOutlinePanelProps = {
  pdf: PDFDocumentProxy;
  currentPage: number;
  onNavigate: (pageNumber: number) => void;
  onClose: () => void;
};

function OutlineBranch({
  nodes,
  depth,
  activeId,
  expanded,
  onToggle,
  onNavigate,
  activeRef,
}: {
  nodes: OutlineTreeNode[];
  depth: number;
  activeId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (pageNumber: number) => void;
  activeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ul className={depth === 0 ? "m-0 list-none space-y-0.5 p-0" : "m-0 ml-2 list-none space-y-0.5 border-l border-[#e7e2d9] p-0 pl-2"}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);
        const isActive = node.id === activeId;
        const canJump = node.pageNumber != null && node.pageNumber >= 1;

        return (
          <li key={node.id}>
            <div className="flex items-stretch gap-0.5">
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={isOpen ? "折叠" : "展开"}
                  aria-expanded={isOpen}
                  onClick={() => onToggle(node.id)}
                  className="flex h-8 w-5 shrink-0 items-center justify-center rounded text-[#a8a29e] hover:bg-[#efebe4] hover:text-[#1c1917]"
                >
                  <span
                    className={`block text-[10px] leading-none transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  >
                    ›
                  </span>
                </button>
              ) : (
                <span className="w-5 shrink-0" aria-hidden />
              )}
              <button
                type="button"
                ref={isActive ? activeRef : undefined}
                disabled={!canJump}
                onClick={() => {
                  if (canJump) onNavigate(node.pageNumber!);
                }}
                className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm leading-snug transition-colors disabled:cursor-default disabled:opacity-50 ${
                  isActive
                    ? "bg-[#efebe4] font-medium text-[#1c1917] ring-1 ring-inset ring-[#d6d3d1]"
                    : "text-[#1c1917] hover:bg-[#efebe4]"
                }`}
                title={
                  node.pageNumber != null
                    ? `${node.title} · 第 ${node.pageNumber} 页`
                    : node.title
                }
              >
                <span className="line-clamp-2">{node.title}</span>
              </button>
            </div>
            {hasChildren && isOpen ? (
              <OutlineBranch
                nodes={node.children}
                depth={depth + 1}
                activeId={activeId}
                expanded={expanded}
                onToggle={onToggle}
                onNavigate={onNavigate}
                activeRef={activeRef}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PdfOutlinePanel({
  pdf,
  currentPage,
  onNavigate,
  onClose,
}: PdfOutlinePanelProps) {
  const [status, setStatus] = useState<OutlineStatus>("loading");
  const [nodes, setNodes] = useState<OutlineTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const pdfRef = useRef(pdf);
  pdfRef.current = pdf;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setNodes([]);

    void (async () => {
      try {
        const tree = await buildOutlineTree(pdfRef.current);
        if (cancelled) return;
        if (tree.length === 0) {
          setNodes([]);
          setStatus("empty");
          return;
        }
        setNodes(tree);
        setExpanded(new Set(tree.map((n) => n.id)));
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setNodes([]);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const activeId = useMemo(
    () => findActiveOutlineId(nodes, currentPage),
    [nodes, currentPage],
  );

  useEffect(() => {
    if (!activeId || nodes.length === 0) return;
    const ancestors = collectAncestorIds(nodes, activeId);
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeId, nodes]);

  useEffect(() => {
    if (status !== "ready" || !activeId) return;
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, status]);

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside
      className="absolute inset-y-0 left-0 z-30 flex w-[min(100%,16rem)] flex-col border-r border-[#e7e2d9] bg-[#faf8f4] shadow-md sm:relative sm:z-auto sm:w-56 sm:shadow-none"
      aria-label="PDF 目录"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#ebe6dc] px-3 py-2">
        <span className="text-sm font-medium text-[#1c1917]">目录</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭目录"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#a8a29e] transition-colors hover:bg-[#efebe4] hover:text-[#1c1917]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {status === "loading" ? (
          <p className="px-2 py-3 text-sm leading-6 text-[#78716c]">加载目录…</p>
        ) : null}
        {status === "empty" ? (
          <p className="px-2 py-3 text-sm leading-6 text-[#78716c]">此 PDF 没有目录</p>
        ) : null}
        {status === "error" ? (
          <p className="px-2 py-3 text-sm leading-6 text-[#b91c1c]">目录加载失败</p>
        ) : null}
        {status === "ready" ? (
          <OutlineBranch
            nodes={nodes}
            depth={0}
            activeId={activeId}
            expanded={expanded}
            onToggle={onToggle}
            onNavigate={onNavigate}
            activeRef={activeRef}
          />
        ) : null}
      </div>
    </aside>
  );
}
