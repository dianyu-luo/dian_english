import "server-only";

import { createClient } from "@libsql/client";
import { copyFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { archiveCurrentRemote, type HistoryEntry } from "./history";
import {
  buildManifest,
  hashFile,
  readManifest,
  writeManifest,
  type SyncManifest,
} from "./manifest";
import {
  ensureSyncDir,
  LOCAL_MANIFEST_PATH,
  LOCAL_SYNC_TMP_DIR,
  pathExists,
  type SyncPaths,
} from "./paths";

export type UploadResult = {
  syncDir: string;
  remoteDbPath: string;
  manifest: SyncManifest;
  /** 覆盖前归档的旧版；首次上传或跳过上传时为 null */
  history: HistoryEntry | null;
  /**
   * true：本地快照与云端 contentHash 一致，未重传 app.db，仅刷新了 manifest
   */
  skippedDbUpload: boolean;
};

function toSqlPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/'/g, "''");
}

/** 对本地库做安全快照到目标路径（VACUUM INTO） */
export async function createDbSnapshot(
  localDbPath: string,
  snapshotPath: string,
): Promise<void> {
  if (!(await pathExists(localDbPath))) {
    throw new Error(`本地数据库不存在: ${localDbPath}`);
  }

  if (await pathExists(snapshotPath)) {
    await unlink(snapshotPath);
  }

  const client = createClient({ url: `file:${localDbPath}` });
  try {
    await client.execute(`VACUUM INTO '${toSqlPath(snapshotPath)}'`);
  } finally {
    client.close();
  }
}

/** Windows 上 rename 覆盖已存在文件可能失败，先删再改名 */
async function atomicMove(tmpPath: string, destPath: string): Promise<void> {
  if (await pathExists(destPath)) {
    await unlink(destPath);
  }
  try {
    await rename(tmpPath, destPath);
  } catch {
    await copyFile(tmpPath, destPath);
    await unlink(tmpPath).catch(() => {});
  }
}

/** 读取云端现行库的 contentHash（优先 manifest，否则直接 hash 文件） */
async function remoteContentHash(
  remoteDbPath: string,
  remoteManifestPath: string,
): Promise<string | null> {
  const remoteManifest = await readManifest(remoteManifestPath);
  if (remoteManifest?.contentHash) return remoteManifest.contentHash;
  if (!(await pathExists(remoteDbPath))) return null;
  const { contentHash } = await hashFile(remoteDbPath);
  return contentHash;
}

/**
 * 将本地 data/app.db 安全快照上传到 OneDrive/db/dian_english。
 * 若与云端 contentHash 一致：不重传库文件、不写 history，只刷新 manifest。
 */
export async function uploadDbToOneDrive(): Promise<UploadResult> {
  const paths: SyncPaths = await ensureSyncDir();
  const snapshotPath = path.join(LOCAL_SYNC_TMP_DIR, "app.db");
  const remoteDbTmp = `${paths.remoteDbPath}.tmp`;
  const remoteManifestTmp = `${paths.remoteManifestPath}.tmp`;

  await createDbSnapshot(paths.localDbPath, snapshotPath);

  const { contentHash, byteSize } = await hashFile(snapshotPath);
  const manifest = buildManifest({ contentHash, byteSize });

  const existingHash = await remoteContentHash(
    paths.remoteDbPath,
    paths.remoteManifestPath,
  );

  if (existingHash && existingHash === contentHash) {
    await writeFile(
      remoteManifestTmp,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await atomicMove(remoteManifestTmp, paths.remoteManifestPath);
    await writeManifest(LOCAL_MANIFEST_PATH, manifest);
    await unlink(snapshotPath).catch(() => {});

    return {
      syncDir: paths.syncDir,
      remoteDbPath: paths.remoteDbPath,
      manifest,
      history: null,
      skippedDbUpload: true,
    };
  }

  const history = await archiveCurrentRemote({
    syncDir: paths.syncDir,
    remoteDbPath: paths.remoteDbPath,
    remoteManifestPath: paths.remoteManifestPath,
  });

  await copyFile(snapshotPath, remoteDbTmp);
  await writeFile(
    remoteManifestTmp,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  await atomicMove(remoteDbTmp, paths.remoteDbPath);
  await atomicMove(remoteManifestTmp, paths.remoteManifestPath);
  await writeManifest(LOCAL_MANIFEST_PATH, manifest);
  await unlink(snapshotPath).catch(() => {});

  return {
    syncDir: paths.syncDir,
    remoteDbPath: paths.remoteDbPath,
    manifest,
    history,
    skippedDbUpload: false,
  };
}
