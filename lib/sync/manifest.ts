import "server-only";

import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { hostname } from "os";
import { pathExists } from "./paths";

export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_APP = "dian_english" as const;

export type SyncManifest = {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  exportedAt: string;
  contentHash: string;
  byteSize: number;
  sourceHost: string;
  app: typeof MANIFEST_APP;
};

export type ManifestCompare =
  | { kind: "equal" }
  | { kind: "useRemote"; reason: string }
  | { kind: "keepLocal"; reason: string }
  | { kind: "conflict"; reason: string }
  | { kind: "missingLocal" }
  | { kind: "missingRemote" };

export async function hashFile(filePath: string): Promise<{
  contentHash: string;
  byteSize: number;
}> {
  const buffer = await readFile(filePath);
  return {
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    byteSize: buffer.byteLength,
  };
}

export function buildManifest(input: {
  contentHash: string;
  byteSize: number;
  exportedAt?: Date;
  sourceHost?: string;
}): SyncManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    contentHash: input.contentHash,
    byteSize: input.byteSize,
    sourceHost: input.sourceHost ?? hostname(),
    app: MANIFEST_APP,
  };
}

export async function readManifest(
  manifestPath: string,
): Promise<SyncManifest | null> {
  if (!(await pathExists(manifestPath))) return null;
  try {
    const raw = await readFile(manifestPath, "utf8");
    const data = JSON.parse(raw) as Partial<SyncManifest>;
    if (
      data.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
      data.app !== MANIFEST_APP ||
      typeof data.exportedAt !== "string" ||
      typeof data.contentHash !== "string" ||
      typeof data.byteSize !== "number"
    ) {
      return null;
    }
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      exportedAt: data.exportedAt,
      contentHash: data.contentHash,
      byteSize: data.byteSize,
      sourceHost: typeof data.sourceHost === "string" ? data.sourceHost : "",
      app: MANIFEST_APP,
    };
  } catch {
    return null;
  }
}

export async function writeManifest(
  manifestPath: string,
  manifest: SyncManifest,
): Promise<void> {
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, body, "utf8");
}

/** 比较两边 manifest；供启动同步（后续步骤）使用 */
export function compareManifests(
  local: SyncManifest | null,
  remote: SyncManifest | null,
): ManifestCompare {
  if (!local && !remote) return { kind: "conflict", reason: "两边都无 manifest" };
  if (!local && remote) return { kind: "missingLocal" };
  if (local && !remote) return { kind: "missingRemote" };
  if (!local || !remote) return { kind: "conflict", reason: "状态异常" };

  if (local.contentHash === remote.contentHash) {
    return { kind: "equal" };
  }

  const localTs = Date.parse(local.exportedAt);
  const remoteTs = Date.parse(remote.exportedAt);
  if (!Number.isFinite(localTs) || !Number.isFinite(remoteTs)) {
    return { kind: "conflict", reason: "exportedAt 无法解析" };
  }

  if (remoteTs > localTs) {
    return { kind: "useRemote", reason: "远端 exportedAt 更新" };
  }
  if (localTs > remoteTs) {
    return { kind: "keepLocal", reason: "本地 exportedAt 更新" };
  }

  return {
    kind: "conflict",
    reason: "hash 不同且 exportedAt 相同",
  };
}
