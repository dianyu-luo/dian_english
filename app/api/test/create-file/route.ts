import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function POST() {
  const timestamp = Date.now();
  const dir = path.join(process.cwd(), "tmp");
  await mkdir(dir, { recursive: true });

  const filename = `${timestamp}.txt`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, "", "utf8");

  return NextResponse.json({ ok: true, filename });
}
