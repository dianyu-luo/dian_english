import { SiteHeader } from "@/components/site-header";
import { ActivityDetailClient } from "./activity-detail-client";
import {
  getFileDwellSessions,
  getFilePdfMeta,
  getMonthAllDwellSlices,
} from "@/lib/activity/file-dwell";
import { getFilePageMarks } from "@/lib/activity/page-marks";
import { getRecentEdits } from "@/lib/activity/recent-edits";

export const metadata = {
  title: "详细数据",
  description: "单个文件的浏览详细数据",
};

type DetailPageProps = {
  searchParams: Promise<{ fileName?: string }>;
};

export default async function ActivityDetailPage({
  searchParams,
}: DetailPageProps) {
  const { fileName: raw } = await searchParams;
  const fileName = raw?.trim() || "";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [fileSessions, monthAllSessions, recentEdits, pdfMeta, pageMarks] =
    fileName
      ? await Promise.all([
          getFileDwellSessions(fileName),
          getMonthAllDwellSlices(year, month),
          getRecentEdits({ limit: 500, fileName }),
          getFilePdfMeta(fileName),
          getFilePageMarks(fileName),
        ])
      : [[], [], [], { totalPages: 0, recentPage: 0 }, {}];

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">详细数据</h1>
          {fileName ? (
            <p className="max-w-3xl text-base leading-7 text-[#57534e]">
              {fileName}
            </p>
          ) : (
            <p className="text-sm leading-6 text-[#78716c]">
              未指定文件。请从「浏览数据」中点击「查看」进入。
            </p>
          )}
        </section>

        {fileName ? (
          <ActivityDetailClient
            fileName={fileName}
            fileSessions={fileSessions.map((s) => ({
              startedAt: s.startedAt,
              durationMs: s.durationMs,
              pageNumber: s.pageNumber,
            }))}
            monthAllSessions={monthAllSessions}
            totalPages={pdfMeta.totalPages}
            recentPage={pdfMeta.recentPage}
            pageMarks={pageMarks}
            recentEdits={recentEdits.map((item) => ({
              key: item.key,
              kind: item.kind,
              kindLabel: item.kindLabel,
              type: item.type,
              typeLabel: item.typeLabel,
              title: item.title,
              fileName: item.fileName,
              pageNumber: item.pageNumber,
              updatedAt: item.updatedAt.toISOString(),
              href: item.href,
            }))}
            initialYear={year}
            initialMonth={month}
          />
        ) : null}
      </main>
    </div>
  );
}
