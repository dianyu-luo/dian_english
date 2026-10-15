import "server-only";

import {
  copyFile,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "fs/promises";
import path from "path";
import { readManifest, type SyncManifest } from "./manifest";
import { pathExists } from "./paths";

/** 默认保留最近份数；可用 SYNC_HISTORY_KEEP 覆盖 */
export const DEFAULT_HISTORY_KEEP = 10;

export function historyDir(syncDir: string): string {
  return path.join(syncDir, "history");
}

/** 将 ISO 时间转为 Windows 友好的目录名 */
export function stampFromIso(iso: string): string {
  const t = Date.parse(iso);
  const d = Number.isFinite(t) ? new Date(t) : new Date();
  return d
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, (m) => `-${m.slice(1, 4)}Z`);
}

export function historyKeepCount(): number {
  const raw = process.env.SYNC_HISTORY_KEEP?.trim();
  const n = raw ? Number(raw) : DEFAULT_HISTORY_KEEP;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_HISTORY_KEEP;
  return Math.min(Math.floor(n), 100);
}

export type HistoryEntry = {
  /** 目录名，等同 stamp */
  id: string;
  stamp: string;
  dir: string;
  manifest: SyncManifest | null;
};

/** 列出 history 子目录（新→旧） */
export async function listHistory(syncDir: string): Promise<HistoryEntry[]> {
  const root = historyDir(syncDir);
  if (!(await pathExists(root))) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const stamps = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a));

  const result: HistoryEntry[] = [];
  for (const stamp of stamps) {
    const dir = path.join(root, stamp);
    const manifest = await readManifest(path.join(dir, "manifest.json"));
    result.push({ id: stamp, stamp, dir, manifest });
  }
  return result;
}

/**
 * 上传覆盖前：若现行远端 app.db 存在，归档到 history/<stamp>/，并裁剪超额。
 */
export async function archiveCurrentRemote(input: {
  syncDir: string;
  remoteDbPath: string;
  remoteManifestPath: string;
}): Promise<HistoryEntry | null> {
  if (!(await pathExists(input.remoteDbPath))) return null;

  const existing = await readManifest(input.remoteManifestPath);
  const stamp = stampFromIso(existing?.exportedAt ?? new Date().toISOString());
  const root = historyDir(input.syncDir);
  let dest = path.join(root, stamp);

  if (await pathExists(dest)) {
    dest = path.join(root, `${stamp}-${Date.now().toString(36)}`);
  }

  await mkdir(dest, { recursive: true });
  await copyFile(input.remoteDbPath, path.join(dest, "app.db"));

  if (existing) {
    await writeFile(
      path.join(dest, "manifest.json"),
      `${JSON.stringify(existing, null, 2)}\n`,
      "utf8",
    );
  } else if (await pathExists(input.remoteManifestPath)) {
    await copyFile(
      input.remoteManifestPath,
      path.join(dest, "manifest.json"),
    );
  }

  await pruneHistory(input.syncDir);
  const finalStamp = path.basename(dest);
  return {
    id: finalStamp,
    stamp: finalStamp,
    dir: dest,
    manifest: existing,
  };
}

/** 只保留最近 N 份 history 目录 */
export async function pruneHistory(syncDir: string): Promise<number> {
  const keep = historyKeepCount();
  const entries = await listHistory(syncDir);
  if (entries.length <= keep) return 0;

  let removed = 0;
  for (const entry of entries.slice(keep)) {
    await rm(entry.dir, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}
