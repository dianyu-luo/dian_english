"use client";

import { useCallback, useEffect, useState } from "react";

type SyncManifest = {
  exportedAt: string;
  contentHash: string;
  byteSize: number;
  sourceHost: string;
};

type ManifestCompare = {
  kind: string;
  reason?: string;
};

type SyncStatus = {
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
  localDirty: boolean;
};

const fieldClass =
  "w-full max-w-xl border border-[#d6d3d1] bg-[#faf8f4] px-3 py-1.5 text-sm text-[#57534e]";

const btnClass =
  "border border-[#d6d3d1] bg-white px-3 py-1.5 text-sm text-[#1c1917] transition-colors hover:bg-[#f5f0e8] disabled:cursor-not-allowed disabled:opacity-60";

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-6">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-[#1c1917]">{label}</p>
        {hint ? <p className="text-xs leading-5 text-[#a8a29e]">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function compareLabel(compare: ManifestCompare | null, localDirty: boolean): string {
  if (!compare) {
    return localDirty ? "尚未上传" : "暂无同步记录";
  }
  switch (compare.kind) {
    case "equal":
      return localDirty ? "云端与上次上传一致，本地可能有新更改" : "本地与云端一致";
    case "useRemote":
      return `云端更新（${compare.reason ?? "可用云端覆盖本地"}）`;
    case "keepLocal":
      return `本地更新（${compare.reason ?? "可上传覆盖云端"}）`;
    case "missingRemote":
      return "云端尚无备份";
    case "missingLocal":
      return "本地无上次上传记录";
    case "conflict":
      return `冲突（${compare.reason ?? "请手动处理"}）`;
    default:
      return compare.kind;
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString();
}

function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function SyncSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/status");
      const data = (await res.json()) as SyncStatus & { error?: string };
      if (!res.ok && data.error) {
        setError(data.error);
        setStatus(null);
        return;
      }
      setStatus(data);
      if (!data.ok && data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载同步状态失败");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onUpload() {
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/sync/upload", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        status?: SyncStatus;
        manifest?: SyncManifest;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "上传失败");
        return;
      }
      if (data.status) setStatus(data.status);
      else await refresh();
      setMessage(
        data.manifest
          ? `已上传（${formatTime(data.manifest.exportedAt)}，${formatBytes(data.manifest.byteSize)}）`
          : "已上传",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  const remote = status?.remoteManifest;

  return (
    <section className="space-y-4 border-t border-[#d6d3d1] pt-8">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">数据同步</h2>
        <p className="text-sm leading-6 text-[#78716c]">
          仅同步 <code className="text-[#57534e]">data/app.db</code> 到 OneDrive
          （<code className="text-[#57534e]">db/dian_english</code>
          ）。可用环境变量 <code className="text-[#57534e]">SYNC_DIR</code>{" "}
          覆盖目录。
        </p>
      </div>
      <div className="divide-y divide-[#e7e2d9] border-y border-[#e7e2d9]">
        <SettingRow label="同步目录" hint="OneDrive/db/dian_english">
          {loading && !status ? (
            <p className="text-sm text-[#a8a29e]">加载中…</p>
          ) : (
            <input
              readOnly
              value={status?.syncDir ?? error ?? "—"}
              className={fieldClass}
            />
          )}
        </SettingRow>
        <SettingRow label="同步状态">
          <div className="space-y-1">
            <p className="text-sm text-[#57534e]">
              {loading && !status
                ? "加载中…"
                : compareLabel(status?.compare ?? null, status?.localDirty ?? false)}
            </p>
            {status?.localDirty ? (
              <p className="text-xs text-[#b45309]">本地数据库可能有未上传的更改</p>
            ) : null}
          </div>
        </SettingRow>
        <SettingRow label="云端备份" hint="远端 manifest">
          <p className="text-sm text-[#57534e]">
            {status?.remoteDbExists
              ? `${formatTime(remote?.exportedAt)} · ${formatBytes(remote?.byteSize)}`
              : "尚无"}
          </p>
        </SettingRow>
        <SettingRow label="上传到 OneDrive" hint="VACUUM INTO 安全快照后覆盖云端">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnClass}
              disabled={uploading || loading || !status?.ok}
              onClick={() => void onUpload()}
            >
              {uploading ? "上传中…" : "上传数据库"}
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={loading || uploading}
              onClick={() => void refresh()}
            >
              刷新状态
            </button>
          </div>
          {message ? (
            <p className="mt-2 text-xs text-[#166534]">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-[#b91c1c]">{error}</p>
          ) : null}
        </SettingRow>
      </div>
    </section>
  );
}
