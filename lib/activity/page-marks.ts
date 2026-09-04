import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { pdfAnnotations, pdfPins, pdfWordMarks } from "@/lib/db/schema";
import type { PageMarksMap } from "@/lib/activity/page-marks-types";

export type { PageMarkCounts, PageMarksMap } from "@/lib/activity/page-marks-types";

function bump(map: PageMarksMap, page: number, key: "notes" | "annotations") {
  if (!Number.isFinite(page) || page < 1) return;
  const p = Math.floor(page);
  const cur = map[p] ?? { notes: 0, annotations: 0 };
  cur[key] += 1;
  map[p] = cur;
}

/** 汇总某文件各页的笔记与标注数量 */
export async function getFilePageMarks(fileName: string): Promise<PageMarksMap> {
  const name = fileName.trim();
  if (!name) return {};

  const [wordMarks, pins, annotations] = await Promise.all([
    db
      .select({ pageNumber: pdfWordMarks.pageNumber })
      .from(pdfWordMarks)
      .where(eq(pdfWordMarks.fileName, name)),
    db
      .select({
        pageNumber: pdfPins.pageNumber,
        type: pdfPins.type,
      })
      .from(pdfPins)
      .where(and(eq(pdfPins.fileName, name), isNull(pdfPins.deletedAt))),
    db
      .select({ pageNumber: pdfAnnotations.pageNumber })
      .from(pdfAnnotations)
      .where(eq(pdfAnnotations.fileName, name)),
  ]);

  const map: PageMarksMap = {};

  for (const row of wordMarks) {
    bump(map, row.pageNumber, "notes");
  }

  for (const row of pins) {
    if (row.type === "note") bump(map, row.pageNumber, "notes");
    else bump(map, row.pageNumber, "annotations");
  }

  for (const row of annotations) {
    bump(map, row.pageNumber, "annotations");
  }

  return map;
}
