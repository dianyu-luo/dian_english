import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfWordMarks } from "@/lib/db/schema";

type QueryBody = {
  fileName?: string;
  limit?: number;
};

export async function POST(request: Request) {
  let body: QueryBody;
  try {
    body = (await request.json()) as QueryBody;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const limit = Math.min(Number(body.limit ?? 200) || 200, 500);

  const rows = fileName
    ? await db
        .select()
        .from(pdfWordMarks)
        .where(eq(pdfWordMarks.fileName, fileName))
        .orderBy(desc(pdfWordMarks.updatedAt))
        .limit(limit)
    : await db
        .select()
        .from(pdfWordMarks)
        .orderBy(desc(pdfWordMarks.updatedAt))
        .limit(limit);

  return NextResponse.json({ ok: true, items: rows });
}
