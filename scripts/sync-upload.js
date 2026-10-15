/**
 * 第一步 CLI：将 data/app.db 安全快照上传到 OneDrive/db/dian_english
 * 用法（项目根目录）：node scripts/sync-upload.js
 *
 * 可选环境变量 SYNC_DIR：直接指定同步目录（不再拼 db/dian_english）
 */
const { createHash } = require("crypto");
const { createClient } = require("@libsql/client");
const {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} = require("fs/promises");
const { homedir, hostname } = require("os");
const path = require("path");

const SYNC_APP_FOLDER = "dian_english";
const LOCAL_DB_PATH = path.join(process.cwd(), "data", "app.db");
const LOCAL_MANIFEST_PATH = path.join(
  process.cwd(),
  "data",
  ".sync-manifest.json",
);
const LOCAL_SYNC_TMP_DIR = path.join(process.cwd(), "data", ".sync-tmp");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveOneDriveRoot() {
  const candidates = [];
  for (const key of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]) {
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
  const seen = new Set();
  for (const raw of candidates) {
    const normalized = path.resolve(raw);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (await exists(normalized)) return normalized;
  }
  return null;
}

async function ensureSyncDir() {
  const override = process.env.SYNC_DIR?.trim();
  let syncDir;
  if (override) {
    syncDir = path.resolve(override);
  } else {
    const root = await resolveOneDriveRoot();
    if (!root) {
      throw new Error(
        "未找到 OneDrive 目录。请登录 OneDrive，或设置 SYNC_DIR。",
      );
    }
    syncDir = path.join(root, "db", SYNC_APP_FOLDER);
  }
  await mkdir(syncDir, { recursive: true });
  await mkdir(LOCAL_SYNC_TMP_DIR, { recursive: true });
  return {
    syncDir,
    remoteDbPath: path.join(syncDir, "app.db"),
    remoteManifestPath: path.join(syncDir, "manifest.json"),
  };
}

function toSqlPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/'/g, "''");
}

async function createDbSnapshot(localDbPath, snapshotPath) {
  if (!(await exists(localDbPath))) {
    throw new Error(`本地数据库不存在: ${localDbPath}`);
  }
  if (await exists(snapshotPath)) await unlink(snapshotPath);
  const client = createClient({ url: `file:${localDbPath}` });
  try {
    await client.execute(`VACUUM INTO '${toSqlPath(snapshotPath)}'`);
  } finally {
    client.close();
  }
}

async function atomicMove(tmpPath, destPath) {
  if (await exists(destPath)) await unlink(destPath);
  try {
    await rename(tmpPath, destPath);
  } catch {
    await copyFile(tmpPath, destPath);
    await unlink(tmpPath).catch(() => {});
  }
}

function stampFromIso(iso) {
  const t = Date.parse(iso);
  const d = Number.isFinite(t) ? new Date(t) : new Date();
  return d
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, (m) => `-${m.slice(1, 4)}Z`);
}

function historyKeepCount() {
  const raw = process.env.SYNC_HISTORY_KEEP?.trim();
  const n = raw ? Number(raw) : 10;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(Math.floor(n), 100);
}

async function archiveCurrentRemote(paths) {
  if (!(await exists(paths.remoteDbPath))) return null;
  let existing = null;
  if (await exists(paths.remoteManifestPath)) {
    try {
      existing = JSON.parse(await readFile(paths.remoteManifestPath, "utf8"));
    } catch {
      existing = null;
    }
  }
  const stamp = stampFromIso(existing?.exportedAt ?? new Date().toISOString());
  const root = path.join(paths.syncDir, "history");
  let dest = path.join(root, stamp);
  if (await exists(dest)) {
    dest = path.join(root, `${stamp}-${Date.now().toString(36)}`);
  }
  await mkdir(dest, { recursive: true });
  await copyFile(paths.remoteDbPath, path.join(dest, "app.db"));
  if (existing) {
    await writeFile(
      path.join(dest, "manifest.json"),
      `${JSON.stringify(existing, null, 2)}\n`,
      "utf8",
    );
  } else if (await exists(paths.remoteManifestPath)) {
    await copyFile(
      paths.remoteManifestPath,
      path.join(dest, "manifest.json"),
    );
  }

  // prune
  const keep = historyKeepCount();
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a));
  for (const name of entries.slice(keep)) {
    await rm(path.join(root, name), { recursive: true, force: true });
  }

  return dest;
}

async function main() {
  const paths = await ensureSyncDir();
  const snapshotPath = path.join(LOCAL_SYNC_TMP_DIR, "app.db");
  const remoteDbTmp = `${paths.remoteDbPath}.tmp`;
  const remoteManifestTmp = `${paths.remoteManifestPath}.tmp`;

  console.log("local:", LOCAL_DB_PATH);
  console.log("syncDir:", paths.syncDir);

  await createDbSnapshot(LOCAL_DB_PATH, snapshotPath);
  const buffer = await readFile(snapshotPath);
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    contentHash,
    byteSize: buffer.byteLength,
    sourceHost: hostname(),
    app: SYNC_APP_FOLDER,
  };

  let existingHash = null;
  if (await exists(paths.remoteManifestPath)) {
    try {
      const remoteManifest = JSON.parse(
        await readFile(paths.remoteManifestPath, "utf8"),
      );
      existingHash = remoteManifest.contentHash || null;
    } catch {
      existingHash = null;
    }
  }
  if (!existingHash && (await exists(paths.remoteDbPath))) {
    const remoteBuf = await readFile(paths.remoteDbPath);
    existingHash = createHash("sha256").update(remoteBuf).digest("hex");
  }

  if (existingHash && existingHash === contentHash) {
    await writeFile(
      remoteManifestTmp,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await atomicMove(remoteManifestTmp, paths.remoteManifestPath);
    await writeFile(
      LOCAL_MANIFEST_PATH,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await unlink(snapshotPath).catch(() => {});
    console.log("skipped db upload (hash match), refreshed manifest only");
    console.log("manifest:", JSON.stringify(manifest, null, 2));
    return;
  }

  const archived = await archiveCurrentRemote(paths);

  await copyFile(snapshotPath, remoteDbTmp);
  await writeFile(
    remoteManifestTmp,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await atomicMove(remoteDbTmp, paths.remoteDbPath);
  await atomicMove(remoteManifestTmp, paths.remoteManifestPath);
  await writeFile(
    LOCAL_MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await unlink(snapshotPath).catch(() => {});

  console.log("uploaded:", paths.remoteDbPath);
  if (archived) console.log("history:", archived);
  console.log("localManifest:", LOCAL_MANIFEST_PATH);
  console.log("manifest:", JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
