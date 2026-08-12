import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ storageKey: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { storageKey } = await params;
  const key = decodeURIComponent(storageKey);

  if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
    return NextResponse.json({ ok: false, error: "非法文件名" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "pdfs", key);

  try {
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${key}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "文件不存在" }, { status: 404 });
  }
}
