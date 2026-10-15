import "server-only";

import { access, mkdir, readdir } from "fs/promises";
import { homedir } from "os";
import path from "path";

/** OneDrive 同步应用目录名 */
export const SYNC_APP_FOLDER = "dian_english";

export const LOCAL_DATA_DIR = path.join(process.cwd(), "data");
export const LOCAL_DB_PATH = path.join(LOCAL_DATA_DIR, "app.db");
/** 上次成功上传的本地侧 manifest（与远端对比用） */
export const LOCAL_MANIFEST_PATH = path.join(LOCAL_DATA_DIR, ".sync-manifest.json");
export const LOCAL_SYNC_TMP_DIR = path.join(LOCAL_DATA_DIR, ".sync-tmp");

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析 OneDrive 根目录。
 * 优先 SYNC_DIR（完整同步根，已含 db/dian_english 时勿再拼）；
 * 若设置的是「OneDrive 根或 …/db」，由 getSyncDir 再拼 dian_english。
 *
 * 环境变量：
 * - SYNC_DIR：直接作为同步目录（最终存放 app.db 的目录）
 * - OneDrive / OneDriveConsumer / OneDriveCommercial：微软常见变量
 */
export async function resolveOneDriveRoot(): Promise<string | null> {
  const candidates: string[] = [];

  for (const key of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] as const) {
    const v = process.env[key]?.trim();
    if (v) candidates.push(v);
  }

  const home = homedir();
  candidates.push(path.join(home, "OneDrive"));

  try {
    const entries = await readdir(home, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && /^OneDrive(\b| )/i.test(ent.name)) {
        candidates.push(path.join(home, ent.name));
      }
    }
  } catch {
    // ignore
  }

  const seen = new Set<string>();
  for (const raw of candidates) {
    const normalized = path.resolve(raw);
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    if (await exists(normalized)) return normalized;
  }

  return null;
}

export type SyncPaths = {
  /** 存放 app.db / manifest.json 的目录 */
  syncDir: string;
  remoteDbPath: string;
  remoteManifestPath: string;
  localDbPath: string;
};

/**
 * 得到同步目录（默认 OneDrive/db/dian_english）。
 * 不存在则递归创建。
 *
 * SYNC_DIR 若已设置，视为最终 syncDir（不再追加 db/dian_english）。
 */
/** 解析同步路径，不创建目录；找不到 OneDrive 时返回 error */
export async function resolveSyncPaths(): Promise<
  { ok: true; paths: SyncPaths } | { ok: false; error: string }
> {
  const override = process.env.SYNC_DIR?.trim();
  let syncDir: string;

  if (override) {
    syncDir = path.resolve(override);
  } else {
    const oneDriveRoot = await resolveOneDriveRoot();
    if (!oneDriveRoot) {
      return {
        ok: false,
        error:
          "未找到 OneDrive 目录。请安装/登录 OneDrive，或设置环境变量 SYNC_DIR 为同步目录。",
      };
    }
    syncDir = path.join(oneDriveRoot, "db", SYNC_APP_FOLDER);
  }

  return {
    ok: true,
    paths: {
      syncDir,
      remoteDbPath: path.join(syncDir, "app.db"),
      remoteManifestPath: path.join(syncDir, "manifest.json"),
      localDbPath: LOCAL_DB_PATH,
    },
  };
}

export async function ensureSyncDir(): Promise<SyncPaths> {
  const resolved = await resolveSyncPaths();
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  await mkdir(resolved.paths.syncDir, { recursive: true });
  await mkdir(LOCAL_SYNC_TMP_DIR, { recursive: true });

  return resolved.paths;
}

export async function pathExists(filePath: string): Promise<boolean> {
  return exists(filePath);
}
