import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfWordMarks } from "@/lib/db/schema";

const ALLOWED_TYPES = new Set(["word", "sentence"]);

type Rect = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

type SaveBody = {
  id?: number;
  fileName?: string;
  word?: string;
  type?: string;
  note?: string;
  pageNumber?: number;
  rect?: Rect;
  contextBefore?: string;
  contextAfter?: string;
  locator?: string;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidRect(rect: Rect | undefined): rect is Required<Rect> {
  return (
    !!rect &&
    [rect.left, rect.top, rect.width, rect.height].every(isFiniteNumber)
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 500);

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

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const fileName = body.fileName?.trim();
  const word = body.word?.trim();
  const type = body.type?.trim();
  const note =
    typeof body.note === "string" ? body.note : undefined;
  const pageNumber = body.pageNumber;
  const rect = body.rect;
  const locator = body.locator?.trim();

  if (
    !fileName ||
    !word ||
    !type ||
    !ALLOWED_TYPES.has(type) ||
    !locator ||
    !isFiniteNumber(pageNumber) ||
    pageNumber < 1 ||
    !isValidRect(rect)
  ) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(pdfWordMarks)
    .where(
      and(
        eq(pdfWordMarks.fileName, fileName),
        eq(pdfWordMarks.word, word),
        eq(pdfWordMarks.type, type),
        eq(pdfWordMarks.pageNumber, pageNumber),
        eq(pdfWordMarks.rectLeft, rect.left),
        eq(pdfWordMarks.rectTop, rect.top),
        eq(pdfWordMarks.rectWidth, rect.width),
        eq(pdfWordMarks.rectHeight, rect.height),
      ),
    )
    .limit(1);

  const now = new Date();

  if (existing) {
    const [row] = await db
      .update(pdfWordMarks)
      .set({
        note: note !== undefined ? note : existing.note,
        contextBefore: body.contextBefore ?? existing.contextBefore,
        contextAfter: body.contextAfter ?? existing.contextAfter,
        locator,
        updatedAt: now,
      })
      .where(eq(pdfWordMarks.id, existing.id))
      .returning();
    return NextResponse.json({ ok: true, item: row, created: false });
  }

  const [row] = await db
    .insert(pdfWordMarks)
    .values({
      fileName,
      word,
      type,
      note: note ?? "",
      pageNumber,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      contextBefore: body.contextBefore ?? "",
      contextAfter: body.contextAfter ?? "",
      locator,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json({ ok: true, item: row, created: true });
}

export async function PATCH(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const id = body.id;
  if (!isFiniteNumber(id) || id < 1) {
    return NextResponse.json({ ok: false, error: "缺少 id" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(pdfWordMarks)
    .where(eq(pdfWordMarks.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "记录不存在" }, { status: 404 });
  }

  const now = new Date();
  const nextRect = isValidRect(body.rect)
    ? {
        rectLeft: body.rect.left,
        rectTop: body.rect.top,
        rectWidth: body.rect.width,
        rectHeight: body.rect.height,
      }
    : {};

  const [row] = await db
    .update(pdfWordMarks)
    .set({
      ...nextRect,
      note: typeof body.note === "string" ? body.note : existing.note,
      word: body.word?.trim() || existing.word,
      type:
        body.type && ALLOWED_TYPES.has(body.type.trim())
          ? body.type.trim()
          : existing.type,
      contextBefore: body.contextBefore ?? existing.contextBefore,
      contextAfter: body.contextAfter ?? existing.contextAfter,
      locator: body.locator?.trim() || existing.locator,
      updatedAt: now,
    })
    .where(eq(pdfWordMarks.id, id))
    .returning();

  return NextResponse.json({ ok: true, item: row, created: false });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const idRaw = searchParams.get("id");
  const id = idRaw ? Number(idRaw) : NaN;

  if (!isFiniteNumber(id) || id < 1) {
    return NextResponse.json({ ok: false, error: "缺少 id" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(pdfWordMarks)
    .where(eq(pdfWordMarks.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "记录不存在" }, { status: 404 });
  }

  await db.delete(pdfWordMarks).where(eq(pdfWordMarks.id, id));
  return NextResponse.json({ ok: true, id });
}
