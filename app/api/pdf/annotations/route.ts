import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfAnnotations } from "@/lib/db/schema";

const ALLOWED_TYPES = new Set(["arrow", "circle", "rect"]);

type SaveBody = {
  id?: number;
  fileName?: string;
  pageNumber?: number;
  type?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color?: string;
  strokeWidth?: number;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName");
  const pageNumberRaw = searchParams.get("pageNumber");
  const limit = Math.min(Number(searchParams.get("limit") ?? 500) || 500, 1000);

  if (!fileName) {
    return NextResponse.json({ ok: false, error: "缺少 fileName" }, { status: 400 });
  }

  const pageNumber = pageNumberRaw ? Number(pageNumberRaw) : null;
  const where =
    pageNumber != null && Number.isFinite(pageNumber)
      ? and(eq(pdfAnnotations.fileName, fileName), eq(pdfAnnotations.pageNumber, pageNumber))
      : eq(pdfAnnotations.fileName, fileName);

  const rows = await db
    .select()
    .from(pdfAnnotations)
    .where(where)
    .orderBy(desc(pdfAnnotations.updatedAt))
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
  const type = body.type?.trim();
  const { x1, y1, x2, y2 } = body;
  const color = body.color?.trim() || "#dc2626";
  const strokeWidth = isFiniteNumber(body.strokeWidth) ? body.strokeWidth : 2;

  if (
    !fileName ||
    !type ||
    !ALLOWED_TYPES.has(type) ||
    !isFiniteNumber(pageNumber) ||
    pageNumber < 1 ||
    ![x1, y1, x2, y2].every(isFiniteNumber)
  ) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  const now = new Date();
  const [row] = await db
    .insert(pdfAnnotations)
    .values({
      fileName,
      pageNumber,
      type,
      x1,
      y1,
      x2,
      y2,
      color,
      strokeWidth,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json({ ok: true, item: row, created: true });
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
    .from(pdfAnnotations)
    .where(eq(pdfAnnotations.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "记录不存在" }, { status: 404 });
  }

  await db.delete(pdfAnnotations).where(eq(pdfAnnotations.id, id));
  return NextResponse.json({ ok: true, id });
}
