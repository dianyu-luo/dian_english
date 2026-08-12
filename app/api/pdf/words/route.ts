import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfWordMarks } from "@/lib/db/schema";

type SaveBody = {
  fileName?: string;
  word?: string;
  raw?: string;
  pageNumber?: number;
  rect?: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
  contextBefore?: string;
  contextAfter?: string;
  locator?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);

  const rows = fileName
    ? await db
        .select()
        .from(pdfWordMarks)
        .where(eq(pdfWordMarks.fileName, fileName))
        .orderBy(desc(pdfWordMarks.createdAt))
        .limit(limit)
    : await db
        .select()
        .from(pdfWordMarks)
        .orderBy(desc(pdfWordMarks.createdAt))
        .limit(limit);

  return NextResponse.json({ ok: true, items: rows });
}

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const fileName = body.fileName?.trim();
  const word = body.word?.trim();
  const raw = body.raw?.trim() || word;
  const pageNumber = body.pageNumber;
  const rect = body.rect;
  const locator = body.locator?.trim();

  if (
    !fileName ||
    !word ||
    !raw ||
    !locator ||
    typeof pageNumber !== "number" ||
    !Number.isFinite(pageNumber) ||
    pageNumber < 1 ||
    !rect ||
    ![rect.left, rect.top, rect.width, rect.height].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  ) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  // 同一文件、同一单词且同一位置才视为重复；不同位置可分别保存
  const [existing] = await db
    .select()
    .from(pdfWordMarks)
    .where(
      and(
        eq(pdfWordMarks.fileName, fileName),
        eq(pdfWordMarks.word, word),
        eq(pdfWordMarks.pageNumber, pageNumber),
        eq(pdfWordMarks.rectLeft, rect.left!),
        eq(pdfWordMarks.rectTop, rect.top!),
        eq(pdfWordMarks.rectWidth, rect.width!),
        eq(pdfWordMarks.rectHeight, rect.height!),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ ok: true, item: existing, created: false });
  }

  const [row] = await db
    .insert(pdfWordMarks)
    .values({
      fileName,
      word,
      raw,
      pageNumber,
      rectLeft: rect.left!,
      rectTop: rect.top!,
      rectWidth: rect.width!,
      rectHeight: rect.height!,
      contextBefore: body.contextBefore ?? "",
      contextAfter: body.contextAfter ?? "",
      locator,
      createdAt: new Date(),
    })
    .returning();

  return NextResponse.json({ ok: true, item: row, created: true });
}
