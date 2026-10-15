import { NextResponse } from "next/server";
import { getSyncStatus, uploadDbToOneDrive } from "@/lib/sync";

export async function POST() {
  try {
    const result = await uploadDbToOneDrive();
    const status = await getSyncStatus();
    return NextResponse.json({
      ok: true,
      syncDir: result.syncDir,
      remoteDbPath: result.remoteDbPath,
      manifest: result.manifest,
      history: result.history,
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "上传失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
