import "server-only";

import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { pdfAnnotations, pdfPins, pdfWordMarks } from "@/lib/db/schema";
import { mergeRecentEdits, type RecentEditItem } from "./recent-edit";

export type { RecentEditItem };

export type GetRecentEditsOptions = {
  limit?: number;
  fileName?: string;
  /** 仅返回指定页的编辑；与 fileName 联用时最准确 */
  pageNumber?: number;
};

/** 合并笔记、页内标记、批注，按最近变更时间取前 N 条；可按 fileName / pageNumber 限定 */
export async function getRecentEdits(
  limitOrOpts: number | GetRecentEditsOptions = 20,
  fileNameArg?: string,
): Promise<RecentEditItem[]> {
  const opts: GetRecentEditsOptions =
    typeof limitOrOpts === "number"
      ? { limit: limitOrOpts, fileName: fileNameArg }
      : limitOrOpts;

  const cap = Math.min(Math.max(1, opts.limit ?? 20), 500);
  const name = opts.fileName?.trim() || "";
  const page =
    typeof opts.pageNumber === "number" &&
    Number.isFinite(opts.pageNumber) &&
    opts.pageNumber >= 1
      ? Math.floor(opts.pageNumber)
      : null;

  const noteWhere: SQL[] = [];
  const pinWhere: SQL[] = [isNull(pdfPins.deletedAt)];
  const annWhere: SQL[] = [];
  if (name) {
    noteWhere.push(eq(pdfWordMarks.fileName, name));
    pinWhere.push(eq(pdfPins.fileName, name));
    annWhere.push(eq(pdfAnnotations.fileName, name));
  }
  if (page != null) {
    noteWhere.push(eq(pdfWordMarks.pageNumber, page));
    pinWhere.push(eq(pdfPins.pageNumber, page));
    annWhere.push(eq(pdfAnnotations.pageNumber, page));
  }

  const [notes, marks, annotations] = await Promise.all([
    db
      .select()
      .from(pdfWordMarks)
      .where(noteWhere.length ? and(...noteWhere) : undefined)
      .orderBy(desc(pdfWordMarks.updatedAt))
      .limit(cap),
    db
      .select()
      .from(pdfPins)
      .where(and(...pinWhere))
      .orderBy(desc(pdfPins.updatedAt))
      .limit(cap),
    db
      .select()
      .from(pdfAnnotations)
      .where(annWhere.length ? and(...annWhere) : undefined)
      .orderBy(desc(pdfAnnotations.updatedAt))
      .limit(cap),
  ]);

  return mergeRecentEdits(notes, marks, annotations, cap);
}
