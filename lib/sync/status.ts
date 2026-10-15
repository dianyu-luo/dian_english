import "server-only";

import { stat } from "fs/promises";
import { historyKeepCount, listHistory } from "./history";
import {
  compareManifests,
  readManifest,
  type ManifestCompare,
  type SyncManifest,
} from "./manifest";
import {
  LOCAL_DB_PATH,
  LOCAL_MANIFEST_PATH,
  pathExists,
  resolveSyncPaths,
} from "./paths";

export type SyncStatus = {
  ok: boolean;
  error: string | null;
  syncDir: string | null;
  localDbPath: string;
  remoteDbPath: string | null;
  localDbExists: boolean;
  remoteDbExists: boolean;
  localManifest: SyncManifest | null;
  remoteManifest: SyncManifest | null;
  compare: ManifestCompare | null;
  /** 本地库文件 mtime 晚于上次上传时间，可能有未同步更改 */
  localDirty: boolean;
  historyCount: number;
  historyKeep: number;
  historyLatestId: string | null;
};

async function fileMeta(filePath: string): Promise<{
  exists: boolean;
  mtimeMs: number | null;
}> {
  if (!(await pathExists(filePath))) {
    return { exists: false, mtimeMs: null };
  }
  const s = await stat(filePath);
  return { exists: true, mtimeMs: s.mtimeMs };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const localDbExists = await pathExists(LOCAL_DB_PATH);
  const resolved = await resolveSyncPaths();

  const historyKeep = historyKeepCount();

  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      syncDir: null,
      localDbPath: LOCAL_DB_PATH,
      remoteDbPath: null,
      localDbExists,
      remoteDbExists: false,
      localManifest: null,
      remoteManifest: null,
      compare: null,
      localDirty: localDbExists,
      historyCount: 0,
      historyKeep,
      historyLatestId: null,
    };
  }

  const { paths } = resolved;
  const [localDb, remoteDb, localManifest, remoteManifest, history] =
    await Promise.all([
      fileMeta(paths.localDbPath),
      fileMeta(paths.remoteDbPath),
      readManifest(LOCAL_MANIFEST_PATH),
      readManifest(paths.remoteManifestPath),
      listHistory(paths.syncDir),
    ]);

  let compare: ManifestCompare | null = null;
  if (localManifest || remoteManifest) {
    compare = compareManifests(localManifest, remoteManifest);
  } else if (remoteDb.exists && !localDb.exists) {
    compare = { kind: "missingLocal" };
  } else if (localDb.exists && !remoteDb.exists) {
    compare = { kind: "missingRemote" };
  }

  let localDirty = false;
  if (localDb.exists && localDb.mtimeMs != null) {
    if (localManifest) {
      const uploadedAt = Date.parse(localManifest.exportedAt);
      if (Number.isFinite(uploadedAt) && localDb.mtimeMs > uploadedAt + 1000) {
        localDirty = true;
      }
    } else {
      localDirty = true;
    }
  }

  return {
    ok: true,
    error: null,
    syncDir: paths.syncDir,
    localDbPath: paths.localDbPath,
    remoteDbPath: paths.remoteDbPath,
    localDbExists: localDb.exists,
    remoteDbExists: remoteDb.exists,
    localManifest,
    remoteManifest,
    compare,
    localDirty,
    historyCount: history.length,
    historyKeep,
    historyLatestId: history[0]?.id ?? null,
  };
}
