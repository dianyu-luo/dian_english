import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfQuestions } from "@/lib/db/schema";

type Rect = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

type SaveBody = {
  id?: number;
  fileName?: string;
  pageNumber?: number;
  rect?: Rect;
  content?: string;
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
  const pageNumberRaw = searchParams.get("pageNumber");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 500);

  if (!fileName) {
    return NextResponse.json({ ok: false, error: "缺少 fileName" }, { status: 400 });
  }

  const pageNumber = pageNumberRaw ? Number(pageNumberRaw) : null;
  const where =
    pageNumber != null && Number.isFinite(pageNumber)
      ? and(eq(pdfQuestions.fileName, fileName), eq(pdfQuestions.pageNumber, pageNumber))
      : eq(pdfQuestions.fileName, fileName);

  const rows = await db
    .select()
    .from(pdfQuestions)
    .where(where)
    .orderBy(desc(pdfQuestions.updatedAt))
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
  const pageNumber = body.pageNumber;
  const rect = body.rect;
  const content = typeof body.content === "string" ? body.content : "";

  if (
    !fileName ||
    !isFiniteNumber(pageNumber) ||
    pageNumber < 1 ||
    !isValidRect(rect)
  ) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  const now = new Date();
  const [row] = await db
    .insert(pdfQuestions)
    .values({
      fileName,
      pageNumber,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      content,
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
    .from(pdfQuestions)
    .where(eq(pdfQuestions.id, id))
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
    .update(pdfQuestions)
    .set({
      ...nextRect,
      content: typeof body.content === "string" ? body.content : existing.content,
      pageNumber:
        isFiniteNumber(body.pageNumber) && body.pageNumber >= 1
          ? body.pageNumber
          : existing.pageNumber,
      fileName: body.fileName?.trim() || existing.fileName,
      updatedAt: now,
    })
    .where(eq(pdfQuestions.id, id))
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
    .from(pdfQuestions)
    .where(eq(pdfQuestions.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "记录不存在" }, { status: 404 });
  }

  await db.delete(pdfQuestions).where(eq(pdfQuestions.id, id));
  return NextResponse.json({ ok: true, id });
}
