import "server-only";

import { count, gte, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageDwellSessions, pdfRecentReads } from "@/lib/db/schema";

export type ActivitySummary = {
  todayMs: number;
  weekMs: number;
  fileCount: number;
};

/** 本地时区当天 00:00:00 */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 本地时区本周一 00:00:00（周一为一周起始） */
function startOfLocalWeek(d: Date): Date {
  const day = d.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
  return monday;
}

function toMs(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function getActivitySummary(now = new Date()): Promise<ActivitySummary> {
  const todayStart = startOfLocalDay(now);
  const weekStart = startOfLocalWeek(now);

  const [[todayRow], [weekRow], [fileRow]] = await Promise.all([
    db
      .select({ total: sum(pageDwellSessions.durationMs) })
      .from(pageDwellSessions)
      .where(gte(pageDwellSessions.startedAt, todayStart)),
    db
      .select({ total: sum(pageDwellSessions.durationMs) })
      .from(pageDwellSessions)
      .where(gte(pageDwellSessions.startedAt, weekStart)),
    db.select({ total: count() }).from(pdfRecentReads),
  ]);

  return {
    todayMs: toMs(todayRow?.total),
    weekMs: toMs(weekRow?.total),
    fileCount: toMs(fileRow?.total),
  };
}
