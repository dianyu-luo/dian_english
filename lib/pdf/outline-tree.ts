import type { PDFDocumentProxy } from "pdfjs-dist";

export type OutlineTreeNode = {
  id: string;
  title: string;
  pageNumber: number | null;
  children: OutlineTreeNode[];
};

type RawOutlineItem = {
  title: string;
  dest?: string | Array<unknown> | null;
  items?: RawOutlineItem[];
};

async function resolveDestPage(
  pdf: PDFDocumentProxy,
  dest: string | Array<unknown> | null | undefined,
): Promise<number | null> {
  if (dest == null) return null;
  try {
    const explicit =
      typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit[0] == null) return null;
    const pageIndex = await pdf.getPageIndex(
      explicit[0] as { num: number; gen: number },
    );
    if (!Number.isFinite(pageIndex) || pageIndex < 0) return null;
    return pageIndex + 1;
  } catch {
    return null;
  }
}

/** 将 PDF 大纲解析为带页码的树 */
export async function buildOutlineTree(
  pdf: PDFDocumentProxy,
): Promise<OutlineTreeNode[]> {
  const outline = (await pdf.getOutline()) as RawOutlineItem[] | null;
  if (!outline?.length) return [];

  async function walk(
    item: RawOutlineItem,
    id: string,
  ): Promise<OutlineTreeNode> {
    const pageNumber = await resolveDestPage(pdf, item.dest ?? null);
    const children = item.items?.length
      ? await Promise.all(
          item.items.map((child, i) => walk(child, `${id}.${i}`)),
        )
      : [];
    return {
      id,
      title: item.title?.trim() || "（无标题）",
      pageNumber,
      children,
    };
  }

  return Promise.all(outline.map((item, i) => walk(item, String(i))));
}

/**
 * 文档先序遍历中，最后一个 pageNumber ≤ currentPage 的条目视为当前章节。
 */
export function findActiveOutlineId(
  nodes: OutlineTreeNode[],
  currentPage: number,
): string | null {
  if (currentPage < 1 || nodes.length === 0) return null;
  let active: string | null = null;
  const visit = (list: OutlineTreeNode[]) => {
    for (const node of list) {
      if (node.pageNumber != null && node.pageNumber <= currentPage) {
        active = node.id;
      }
      if (node.children.length > 0) visit(node.children);
    }
  };
  visit(nodes);
  return active;
}

/** 返回目标节点的祖先 id（不含自身） */
export function collectAncestorIds(
  nodes: OutlineTreeNode[],
  targetId: string,
): string[] {
  const walk = (
    list: OutlineTreeNode[],
    trail: string[],
  ): string[] | null => {
    for (const node of list) {
      if (node.id === targetId) return trail;
      if (node.children.length > 0) {
        const found = walk(node.children, [...trail, node.id]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}
