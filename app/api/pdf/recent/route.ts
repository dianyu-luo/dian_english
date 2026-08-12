import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfRecentReads } from "@/lib/db/schema";

const pdfDir = path.join(process.cwd(), "data", "pdfs");

function fileUrl(storageKey: string) {
  return `/api/pdf/file/${encodeURIComponent(storageKey)}`;
}

function serialize(row: typeof pdfRecentReads.$inferSelect) {
  return {
    id: row.id,
    fileName: row.fileName,
    pageNumber: row.pageNumber,
    storageKey: row.storageKey,
    fileSize: row.fileSize,
    updatedAt: row.updatedAt,
    url: fileUrl(row.storageKey),
  };
}

/** 取最近一次阅读记录 */
export async function GET() {
  const [row] = await db
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
 * - multipart：上传 PDF 并记录页码
 * - JSON：仅更新已有文件的页码
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const pageRaw = form.get("pageNumber");

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
        storageKey: storageToUse,
        fileSize: buffer.length,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ ok: true, item: serialize(row) });
  }

  let body: { fileName?: string; pageNumber?: number };
  try {
    body = (await request.json()) as { fileName?: string; pageNumber?: number };
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const fileName = body.fileName?.trim();
  const pageNumber = body.pageNumber;

  if (
    !fileName ||
    typeof pageNumber !== "number" ||
    !Number.isFinite(pageNumber) ||
    pageNumber < 1
  ) {
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
    .set({ pageNumber: Math.floor(pageNumber), updatedAt: new Date() })
    .where(eq(pdfRecentReads.fileName, fileName))
    .returning();

  return NextResponse.json({ ok: true, item: serialize(row) });
}
