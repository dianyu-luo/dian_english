import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { helloTest } from "@/lib/db/schema";

export async function POST() {
  const [row] = await db
    .insert(helloTest)
    .values({
      uuid: randomUUID(),
      createdAt: new Date(),
    })
    .returning();

  return NextResponse.json({
    ok: true,
    id: row.id,
    uuid: row.uuid,
    createdAt: row.createdAt,
  });
}
