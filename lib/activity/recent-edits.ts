import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { pdfAnnotations, pdfPins, pdfWordMarks } from "@/lib/db/schema";
import { mergeRecentEdits, type RecentEditItem } from "./recent-edit";

export type { RecentEditItem };

/** 合并笔记、页内标记、批注，按最近变更时间取前 N 条；可按 fileName 限定单个文件 */
export async function getRecentEdits(
  limit = 20,
  fileName?: string,
): Promise<RecentEditItem[]> {
  const cap = Math.min(Math.max(1, limit), 50);
  const name = fileName?.trim() || "";

  const [notes, marks, annotations] = await Promise.all([
    name
      ? db
          .select()
          .from(pdfWordMarks)
          .where(eq(pdfWordMarks.fileName, name))
          .orderBy(desc(pdfWordMarks.updatedAt))
          .limit(cap)
      : db
          .select()
          .from(pdfWordMarks)
          .orderBy(desc(pdfWordMarks.updatedAt))
          .limit(cap),
    name
      ? db
          .select()
          .from(pdfPins)
          .where(and(eq(pdfPins.fileName, name), isNull(pdfPins.deletedAt)))
          .orderBy(desc(pdfPins.updatedAt))
          .limit(cap)
      : db
          .select()
          .from(pdfPins)
          .where(isNull(pdfPins.deletedAt))
          .orderBy(desc(pdfPins.updatedAt))
          .limit(cap),
    name
      ? db
          .select()
          .from(pdfAnnotations)
          .where(eq(pdfAnnotations.fileName, name))
          .orderBy(desc(pdfAnnotations.updatedAt))
          .limit(cap)
      : db
          .select()
          .from(pdfAnnotations)
          .orderBy(desc(pdfAnnotations.updatedAt))
          .limit(cap),
  ]);

  return mergeRecentEdits(notes, marks, annotations, cap);
}
