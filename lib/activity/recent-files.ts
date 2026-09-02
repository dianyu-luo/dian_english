import "server-only";

import { and, desc, gte, inArray, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageDwellSessions, pdfRecentReads } from "@/lib/db/schema";

export type RecentFileItem = {
  id: number;
  fileName: string;
  pageNumber: number;
  scale: number;
  storageKey: string;
  fileSize: number;
  updatedAt: Date;
  /** 该文档今日浏览时长（毫秒） */
  todayDwellMs: number;
  /** 该文档累计浏览时长（毫秒） */
  dwellMs: number;
};

/** 本地时区当天 00:00:00 */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toMs(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function getRecentFiles(limit = 20): Promise<RecentFileItem[]> {
  const rows = await db
    .select()
    .from(pdfRecentReads)
    .orderBy(desc(pdfRecentReads.updatedAt))
    .limit(Math.min(Math.max(1, limit), 50));

  if (rows.length === 0) return [];

  const names = rows.map((row) => row.fileName);
  const todayStart = startOfLocalDay(new Date());

  const [dwellRows, todayDwellRows] = await Promise.all([
    db
      .select({
        resourceKey: pageDwellSessions.resourceKey,
        total: sum(pageDwellSessions.durationMs),
      })
      .from(pageDwellSessions)
      .where(inArray(pageDwellSessions.resourceKey, names))
      .groupBy(pageDwellSessions.resourceKey),
    db
      .select({
        resourceKey: pageDwellSessions.resourceKey,
        total: sum(pageDwellSessions.durationMs),
      })
      .from(pageDwellSessions)
      .where(
        and(
          inArray(pageDwellSessions.resourceKey, names),
          gte(pageDwellSessions.startedAt, todayStart),
        ),
      )
      .groupBy(pageDwellSessions.resourceKey),
  ]);

  const dwellByName = new Map<string, number>();
  for (const row of dwellRows) {
    if (row.resourceKey) dwellByName.set(row.resourceKey, toMs(row.total));
  }

  const todayDwellByName = new Map<string, number>();
  for (const row of todayDwellRows) {
    if (row.resourceKey) todayDwellByName.set(row.resourceKey, toMs(row.total));
  }

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    scale: row.scale,
    storageKey: row.storageKey,
    fileSize: row.fileSize,
    updatedAt: row.updatedAt,
    todayDwellMs: todayDwellByName.get(row.fileName) ?? 0,
    dwellMs: dwellByName.get(row.fileName) ?? 0,
  }));
}
