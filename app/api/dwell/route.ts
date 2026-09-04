import { and, desc, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pageDwellSessions } from "@/lib/db/schema";

type SaveBody = {
  clientSessionId?: string;
  pagePath?: string;
  resourceKey?: string | null;
  pageNumber?: number | null;
  startedAt?: number;
  endedAt?: number | null;
  durationMs?: number;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toDate(ms: number) {
  return new Date(ms);
}

function serialize(row: typeof pageDwellSessions.$inferSelect) {
  return {
    id: row.id,
    clientSessionId: row.clientSessionId,
    pagePath: row.pagePath,
    resourceKey: row.resourceKey,
    pageNumber: row.pageNumber,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 查询学习时长记录；可按 pagePath / resourceKey / 年月 过滤 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pagePath = searchParams.get("pagePath")?.trim();
  const resourceKey = searchParams.get("resourceKey")?.trim();
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const limit = Math.min(Number(searchParams.get("limit") ?? 100) || 100, 5000);

  const hasMonth =
    Number.isInteger(year) &&
    year >= 1970 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12;

  const filters = [
    ...(pagePath ? [eq(pageDwellSessions.pagePath, pagePath)] : []),
    ...(resourceKey ? [eq(pageDwellSessions.resourceKey, resourceKey)] : []),
    ...(hasMonth
      ? [
          gte(pageDwellSessions.startedAt, new Date(year, month - 1, 1)),
          lt(pageDwellSessions.startedAt, new Date(year, month, 1)),
        ]
      : []),
  ];

  const rows = await db
    .select()
    .from(pageDwellSessions)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(pageDwellSessions.startedAt))
    .limit(limit);

  return NextResponse.json({ ok: true, items: rows.map(serialize) });
}

/** 创建或更新一段连续学习时长（按 clientSessionId upsert） */
export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const clientSessionId = body.clientSessionId?.trim();
  const pagePath = body.pagePath?.trim();
  const startedAt = body.startedAt;
  const endedAt = body.endedAt ?? null;
  const durationMs = body.durationMs;
  const resourceKey =
    typeof body.resourceKey === "string" ? body.resourceKey.trim() || null : null;
  const pageNumber =
    isFiniteNumber(body.pageNumber) && body.pageNumber >= 1
      ? Math.floor(body.pageNumber)
      : null;

  if (
    !clientSessionId ||
    !pagePath ||
    !isFiniteNumber(startedAt) ||
    startedAt <= 0 ||
    !isFiniteNumber(durationMs) ||
    durationMs < 0
  ) {
    return NextResponse.json({ ok: false, error: "缺少必要字段" }, { status: 400 });
  }

  // /pdf 且未指定资源（未打开 PDF）时不写入
  if (pagePath === "/pdf" && resourceKey == null) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (endedAt != null && (!isFiniteNumber(endedAt) || endedAt < startedAt)) {
    return NextResponse.json({ ok: false, error: "endedAt 无效" }, { status: 400 });
  }

  const now = new Date();
  const startedAtDate = toDate(startedAt);
  const endedAtDate = endedAt != null ? toDate(endedAt) : null;

  const [existing] = await db
    .select()
    .from(pageDwellSessions)
    .where(eq(pageDwellSessions.clientSessionId, clientSessionId))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(pageDwellSessions)
      .set({
        pagePath,
        resourceKey,
        pageNumber,
        startedAt: startedAtDate,
        endedAt: endedAtDate,
        durationMs: Math.round(durationMs),
        updatedAt: now,
      })
      .where(eq(pageDwellSessions.clientSessionId, clientSessionId))
      .returning();
    return NextResponse.json({ ok: true, item: serialize(row) });
  }

  const [row] = await db
    .insert(pageDwellSessions)
    .values({
      clientSessionId,
      pagePath,
      resourceKey,
      pageNumber,
      startedAt: startedAtDate,
      endedAt: endedAtDate,
      durationMs: Math.round(durationMs),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json({ ok: true, item: serialize(row) });
}

/** 清空指定年月的停留统计；传 resourceKey 时仅清空该资源 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const resourceKey = searchParams.get("resourceKey")?.trim();
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (
    !Number.isInteger(year) ||
    year < 1970 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ ok: false, error: "缺少有效参数" }, { status: 400 });
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const deleted = await db
    .delete(pageDwellSessions)
    .where(
      and(
        ...(resourceKey
          ? [eq(pageDwellSessions.resourceKey, resourceKey)]
          : []),
        gte(pageDwellSessions.startedAt, start),
        lt(pageDwellSessions.startedAt, end),
      ),
    )
    .returning({ id: pageDwellSessions.id });

  return NextResponse.json({ ok: true, deleted: deleted.length });
}
