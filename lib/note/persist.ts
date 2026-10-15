import type { NoteSaveKind } from "./types";

/** 将 Markdown 写回划词笔记或页内标记 */
export async function persistNoteMarkdown(
  kind: NoteSaveKind,
  id: number,
  markdown: string,
): Promise<void> {
  if (kind === "word") {
    const res = await fetch("/api/pdf/words", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, note: markdown }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? "保存失败");
    return;
  }

  const res = await fetch("/api/pdf/pins", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type: kind, content: markdown }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error ?? "保存失败");
}
