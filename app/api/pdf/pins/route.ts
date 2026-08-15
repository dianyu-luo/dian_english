import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfPins } from "@/lib/db/schema";

const PIN_TYPES = new Set(["question", "note", "bookmark"]);

type Rect = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

type SaveBody = {
  id?: number;
  type?: string;
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

function isPinType(type: unknown): type is "question" | "note" | "bookmark" {
  return typeof type === "string" && PIN_TYPES.has(type);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName");
  const type = searchParams.get("type");
  const pageNumberRaw = searchParams.get("pageNumber");
  const limit = Math.min(Number(searchParams.get("limit") ?? 500) || 500, 1000);

  if (!fileName) {
    return NextResponse.json({ ok: false, error: "缺少 fileName" }, { status: 400 });
  }

  const pageNumber = pageNumberRaw ? Number(pageNumberRaw) : null;
  const filters = [eq(pdfPins.fileName, fileName)];
  if (isPinType(type)) filters.push(eq(pdfPins.type, type));
  if (pageNumber != null && Number.isFinite(pageNumber)) {
    filters.push(eq(pdfPins.pageNumber, pageNumber));
  }

  const rows = await db
    .select()
    .from(pdfPins)
    .where(and(...filters))
    .orderBy(desc(pdfPins.updatedAt))
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
  const type = body.type;

  if (
    !fileName ||
    !isPinType(type) ||
    !isFiniteNumber(pageNumber) ||
    pageNumber < 1 ||
    !isValidRect(rect)
  ) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  const now = new Date();
  const [row] = await db
    .insert(pdfPins)
    .values({
      fileName,
      type,
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
    .from(pdfPins)
    .where(eq(pdfPins.id, id))
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
    .update(pdfPins)
    .set({
      ...nextRect,
      type: isPinType(body.type) ? body.type : existing.type,
      content: typeof body.content === "string" ? body.content : existing.content,
      pageNumber:
        isFiniteNumber(body.pageNumber) && body.pageNumber >= 1
          ? body.pageNumber
          : existing.pageNumber,
      fileName: body.fileName?.trim() || existing.fileName,
      updatedAt: now,
    })
    .where(eq(pdfPins.id, id))
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
    .from(pdfPins)
    .where(eq(pdfPins.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "记录不存在" }, { status: 404 });
  }

  await db.delete(pdfPins).where(eq(pdfPins.id, id));
  return NextResponse.json({ ok: true, id });
}
