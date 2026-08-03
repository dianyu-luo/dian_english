import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { testFiles } from "@/lib/db/schema";

export async function POST() {
  const timestamp = Date.now();
  const dir = path.join(process.cwd(), "tmp");
  await mkdir(dir, { recursive: true });

  const filename = `${timestamp}.txt`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, "", "utf8");

  const [row] = await db
    .insert(testFiles)
    .values({ name: filename })
    .returning();

  return NextResponse.json({
    ok: true,
    filename,
    id: row.id,
  });
}
