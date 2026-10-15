import { NextResponse } from "next/server";
import { getSyncStatus } from "@/lib/sync";

export async function GET() {
  try {
    const status = await getSyncStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取同步状态失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
