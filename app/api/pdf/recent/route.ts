import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfRecentReads } from "@/lib/db/schema";

const pdfDir = path.join(process.cwd(), "data", "pdfs");

const SCALE_MIN = 0.5;
const SCALE_MAX = 2.5;

function fileUrl(storageKey: string) {
  return `/api/pdf/file/${encodeURIComponent(storageKey)}`;
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(value * 100) / 100));
}

function parseTotalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function serialize(row: typeof pdfRecentReads.$inferSelect) {
  return {
    id: row.id,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    scale: row.scale,
    storageKey: row.storageKey,
    fileSize: row.fileSize,
    updatedAt: row.updatedAt,
    url: fileUrl(row.storageKey),
  };
}

/** 取最近阅读：fileName 查单条；limit 查列表；否则最近一条 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName")?.trim();
  const limitRaw = searchParams.get("limit");
  const limit =
    limitRaw != null && limitRaw !== ""
      ? Math.min(Math.max(1, Number(limitRaw) || 20), 50)
      : null;

  if (limit != null && !fileName) {
    const rows = await db
      .select()
      .from(pdfRecentReads)
      .orderBy(desc(pdfRecentReads.updatedAt))
      .limit(limit);
    return NextResponse.json({ ok: true, items: rows.map(serialize) });
  }

  const [row] = fileName
    ? await db
        .select()
        .from(pdfRecentReads)
        .where(eq(pdfRecentReads.fileName, fileName))
        .limit(1)
    : await db
        .select()
        .from(pdfRecentReads)
        .orderBy(desc(pdfRecentReads.updatedAt))
        .limit(1);

  if (!row) {
    return NextResponse.json({ ok: true, item: null });
  }

  return NextResponse.json({ ok: true, item: serialize(row) });
}

/**
 * 保存阅读进度：
 * - multipart：上传 PDF 并记录页码 / 缩放
 * - JSON：仅更新已有文件的页码 / 缩放
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const pageRaw = form.get("pageNumber");
    const scaleRaw = form.get("scale");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "缺少 PDF 文件" }, { status: 400 });
    }

    const fileName = file.name.trim();
    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "仅支持 PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const storageKey = `${hash}-${randomUUID().slice(0, 8)}.pdf`;

    await mkdir(pdfDir, { recursive: true });

    const existing = await db
      .select()
      .from(pdfRecentReads)
      .where(eq(pdfRecentReads.fileName, fileName))
      .limit(1);

    const pageNumber =
      pageRaw != null && String(pageRaw) !== ""
        ? Math.max(1, Number(pageRaw) || 1)
        : (existing[0]?.pageNumber ?? 1);

    const scale =
      scaleRaw != null && String(scaleRaw) !== ""
        ? clampScale(Number(scaleRaw))
        : clampScale(existing[0]?.scale ?? 1);

    let storageToUse = storageKey;
    if (existing[0] && existing[0].fileSize === buffer.length) {
      // 同名同大小：复用已存文件，只更新页码与时间
      storageToUse = existing[0].storageKey;
    } else {
      await writeFile(path.join(pdfDir, storageKey), buffer);
    }

    const now = new Date();
    if (existing[0]) {
      const [row] = await db
        .update(pdfRecentReads)
        .set({
          pageNumber,
          scale,
          storageKey: storageToUse,
          fileSize: buffer.length,
          updatedAt: now,
        })
        .where(eq(pdfRecentReads.fileName, fileName))
        .returning();
      return NextResponse.json({ ok: true, item: serialize(row) });
    }

    const [row] = await db
      .insert(pdfRecentReads)
      .values({
        fileName,
        pageNumber,
        scale,
        storageKey: storageToUse,
        fileSize: buffer.length,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ ok: true, item: serialize(row) });
  }

  let body: { fileName?: string; pageNumber?: number; scale?: number; totalNumber?: number };
  try {
    body = (await request.json()) as {
      fileName?: string;
      pageNumber?: number;
      scale?: number;
      totalNumber?: number;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const fileName = body.fileName?.trim();
  const pageNumber = body.pageNumber;
  const scale = body.scale;
  const totalNumber = parseTotalNumber(body.totalNumber);

  const hasPage =
    typeof pageNumber === "number" && Number.isFinite(pageNumber) && pageNumber >= 1;
  const hasScale = typeof scale === "number" && Number.isFinite(scale);

  if (!fileName || (!hasPage && !hasScale)) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(pdfRecentReads)
    .where(eq(pdfRecentReads.fileName, fileName))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "尚未上传该文件" }, { status: 404 });
  }

  const [row] = await db
    .update(pdfRecentReads)
    .set({
      ...(hasPage ? { pageNumber: Math.floor(pageNumber) } : {}),
      ...(hasScale ? { scale: clampScale(scale) } : {}),
      ...(totalNumber != null ? { totalNumber } : {}),
      updatedAt: new Date(),
    })
    .where(eq(pdfRecentReads.fileName, fileName))
    .returning();

  return NextResponse.json({ ok: true, item: serialize(row) });
}
