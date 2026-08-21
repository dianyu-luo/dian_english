import "server-only";

import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { pdfRecentReads } from "@/lib/db/schema";

export type RecentFileItem = {
  id: number;
  fileName: string;
  pageNumber: number;
  scale: number;
  storageKey: string;
  fileSize: number;
  updatedAt: Date;
};

export async function getRecentFiles(limit = 20): Promise<RecentFileItem[]> {
  const rows = await db
    .select()
    .from(pdfRecentReads)
    .orderBy(desc(pdfRecentReads.updatedAt))
    .limit(Math.min(Math.max(1, limit), 50));

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    scale: row.scale,
    storageKey: row.storageKey,
    fileSize: row.fileSize,
    updatedAt: row.updatedAt,
  }));
}
