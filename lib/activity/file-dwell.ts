import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageDwellSessions } from "@/lib/db/schema";
import type { DwellSlice } from "@/lib/activity/aggregate-dwell";

export type FileDwellSession = DwellSlice & {
  id: number;
  resourceKey: string | null;
};

function toMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function mapSessionRows(
  rows: {
    id: number;
    resourceKey: string | null;
    startedAt: Date | number;
    durationMs: number;
  }[],
): FileDwellSession[] {
  return rows.map((row) => ({
    id: row.id,
    resourceKey: row.resourceKey,
    startedAt: toMs(row.startedAt),
    durationMs: Math.max(0, row.durationMs),
  }));
}

/** 全部停留记录（按开始时间升序） */
export async function getAllDwellSessions(): Promise<FileDwellSession[]> {
  const rows = await db
    .select({
      id: pageDwellSessions.id,
      resourceKey: pageDwellSessions.resourceKey,
      startedAt: pageDwellSessions.startedAt,
      durationMs: pageDwellSessions.durationMs,
    })
    .from(pageDwellSessions)
    .orderBy(pageDwellSessions.startedAt);

  return mapSessionRows(rows);
}

/** 某文件全部停留记录（按开始时间升序） */
export async function getFileDwellSessions(
  fileName: string,
): Promise<FileDwellSession[]> {
  const name = fileName.trim();
  if (!name) return [];

  const rows = await db
    .select({
      id: pageDwellSessions.id,
      resourceKey: pageDwellSessions.resourceKey,
      startedAt: pageDwellSessions.startedAt,
      durationMs: pageDwellSessions.durationMs,
    })
    .from(pageDwellSessions)
    .where(eq(pageDwellSessions.resourceKey, name))
    .orderBy(pageDwellSessions.startedAt);

  return mapSessionRows(rows);
}

/**
 * 某月内「全部应用」停留切片（用于占比分母）。
 * 按 startedAt 落在该月本地区间筛选；时长切分仍由聚合函数处理。
 */
export async function getMonthAllDwellSlices(
  year: number,
  month: number,
): Promise<DwellSlice[]> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const rows = await db
    .select({
      startedAt: pageDwellSessions.startedAt,
      durationMs: pageDwellSessions.durationMs,
    })
    .from(pageDwellSessions)
    .where(
      and(
        gte(pageDwellSessions.startedAt, start),
        lt(pageDwellSessions.startedAt, end),
      ),
    );

  return rows.map((row) => ({
    startedAt: toMs(row.startedAt),
    durationMs: Math.max(0, row.durationMs),
  }));
}
