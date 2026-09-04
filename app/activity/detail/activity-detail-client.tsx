"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  dailyMsForMonth,
  dailyMsForWeek,
  dayKeyFromDate,
  formatDurationDetailed,
  hourlyMsForDay,
  isSameLocalDay,
  monthlyMsForYear,
  pageMsTotals,
  type DwellSliceWithPage,
} from "@/lib/activity/aggregate-dwell";
import { formatDurationMs } from "@/lib/activity/format-duration";
import type { PageMarksMap } from "@/lib/activity/page-marks-types";
import { buildPdfHref } from "@/lib/pdf/jump-search";

export type ActivityDetailClientProps = {
  /** 指定文件时显示占比；省略则为全部应用总览 */
  fileName?: string;
  fileSessions: DwellSliceWithPage[];
  /** 当前所选月份内全部应用的停留（占比分母）；总览模式下可与 fileSessions 相同 */
  monthAllSessions: DwellSliceWithPage[];
  /** PDF 总页数；用于页码热力图范围 */
  totalPages?: number;
  /** 最近阅读页码；折叠时以附近 100 页为窗口 */
  recentPage?: number;
  /** 各页笔记 / 标注数量 */
  pageMarks?: PageMarksMap;
  initialYear: number;
  initialMonth: number;
};

type RangeMode = "day" | "week" | "month" | "year";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;
const RANGE_TABS: { id: RangeMode; label: string }[] = [
  { id: "day", label: "按天" },
  { id: "week", label: "按周" },
  { id: "month", label: "按月" },
  { id: "year", label: "按年" },
];

const ACCENT = "#4f46e5";
const ACCENT_SOFT = "#eef2ff";
const ACCENT_MUTED = "#c7d2fe";
/** 页码阅读热力图：绿色深度表示停留时长 */
const PAGE_HEAT_RGB = "22, 163, 74";
const PAGE_HEAT_EMPTY = "#f4f4f5";
const PAGE_HEAT_COLS = 20;
/** 折叠时只展示最近阅读附近的页数 */
const PAGE_HEAT_WINDOW = 100;
/** 笔记角标 */
const MARK_NOTE = "#eab308";
/** 标注角标（批注 / 问题 / 书签 / 待办） */
const MARK_ANNOTATION = "#ef4444";

function pageMarkOf(
  pageMarks: PageMarksMap | undefined,
  page: number,
): { notes: number; annotations: number } {
  const raw = pageMarks?.[page];
  if (!raw) return { notes: 0, annotations: 0 };
  return {
    notes: Math.max(0, raw.notes || 0),
    annotations: Math.max(0, raw.annotations || 0),
  };
}

function pageHeatWindow(
  totalPages: number,
  centerPage: number,
  windowSize = PAGE_HEAT_WINDOW,
): { start: number; end: number } {
  const total = Math.max(1, totalPages);
  const size = Math.min(windowSize, total);
  let center =
    Number.isFinite(centerPage) && centerPage >= 1 ? Math.floor(centerPage) : 1;
  center = Math.min(total, Math.max(1, center));
  let start = Math.max(1, center - Math.floor((size - 1) / 2));
  let end = start + size - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - size + 1);
  }
  return { start, end };
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  );
}

function yAxisScale(maxMs: number): { scaleMax: number; ticks: { ms: number; label: string }[] } {
  if (maxMs <= 0) {
    return {
      scaleMax: 3_600_000,
      ticks: [
        { ms: 3_600_000, label: "1小时" },
        { ms: 1_800_000, label: "30分钟" },
      ],
    };
  }
  const nice = [60_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
  const scaleMax =
    nice.find((n) => n >= maxMs) ?? Math.ceil(maxMs / 3_600_000) * 3_600_000;
  return {
    scaleMax,
    ticks: [
      { ms: scaleMax, label: formatDurationMs(scaleMax) },
      { ms: scaleMax / 2, label: formatDurationMs(scaleMax / 2) },
    ],
  };
}

function BarChart({
  values,
  labels,
  highlightIndex,
}: {
  values: number[];
  labels: string[];
  highlightIndex?: number | null;
}) {
  const maxVal = Math.max(...values, 0);
  const { scaleMax, ticks } = yAxisScale(maxVal);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  return (
    <div className="relative mt-6 h-64 w-full overflow-visible">
      <div className="absolute inset-y-0 right-0 w-16 pb-6 text-[11px] text-[#a1a1aa]">
        {ticks.map((tick) => {
          const top = 100 - (tick.ms / scaleMax) * 100;
          return (
            <span
              key={tick.ms}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
              style={{ top: `${top}%` }}
            >
              {tick.label}
            </span>
          );
        })}
      </div>

      {ticks.map((tick) => {
        const top = 100 - (tick.ms / scaleMax) * 100;
        return (
          <div
            key={`line-${tick.ms}`}
            className="pointer-events-none absolute left-0 border-t border-dashed border-[#d4d4d8]"
            style={{ top: `${top}%`, right: "4rem" }}
          />
        );
      })}

      <div className="absolute inset-y-0 left-0 flex items-end gap-px pb-6" style={{ right: "4rem" }}>
        {values.map((ms, i) => {
          const h = ms <= 0 ? 0 : Math.max(2, (ms / scaleMax) * 100);
          const active = highlightIndex === i || hoverIndex === i;
          const showTip = hoverIndex === i;
          return (
            <div
              key={i}
              className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {showTip ? (
                <div
                  className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#18181b] px-2 py-1 text-[11px] text-white shadow-sm"
                  style={{
                    bottom: `calc(1.5rem + (100% - 1.5rem) * ${h / 100} + 6px)`,
                  }}
                >
                  {labels[i]} · {formatDurationDetailed(ms)}
                </div>
              ) : null}
              <div
                className="w-[55%] max-w-5 rounded-t-sm transition-colors"
                style={{
                  height: `${h}%`,
                  backgroundColor: active || ms > 0 ? ACCENT : "transparent",
                  opacity: ms > 0 ? (active ? 1 : 0.85) : 0,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 left-0 flex gap-px" style={{ right: "4rem" }}>
        {labels.map((label, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 text-center text-[10px] text-[#a1a1aa] tabular-nums"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Heatmap({
  year,
  month,
  dailyMs,
  selectedDay,
  onSelectDay,
}: {
  year: number;
  month: number;
  dailyMs: number[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
}) {
  const first = new Date(year, month - 1, 1);
  const firstDow = first.getDay();
  const mondayIndex = firstDow === 0 ? 6 : firstDow - 1;
  const maxDay = Math.max(...dailyMs, 1);
  const cells: (number | null)[] = [
    ...Array.from({ length: mondayIndex }, () => null),
    ...dailyMs.map((_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="min-w-0 flex-1">
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-[#78716c]">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day == null) {
            return <div key={`e-${i}`} className="aspect-square" />;
          }
          const ms = dailyMs[day - 1] ?? 0;
          const intensity = ms <= 0 ? 0 : 0.18 + 0.82 * (ms / maxDay);
          const date = new Date(year, month - 1, day);
          const selected = isSameLocalDay(date, selectedDay);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(date)}
              title={`${month}/${day} · ${formatDurationDetailed(ms)}`}
              className="aspect-square rounded-md transition-shadow"
              style={{
                backgroundColor:
                  ms > 0 ? `rgba(79, 70, 229, ${intensity})` : "#f4f4f5",
                boxShadow: selected ? `inset 0 0 0 2px ${ACCENT}` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PageReadingHeatmap({
  pageMs,
  fileName,
  recentPage = 0,
  pageMarks,
}: {
  pageMs: number[];
  fileName: string;
  recentPage?: number;
  pageMarks?: PageMarksMap;
}) {
  const maxMs = Math.max(...pageMs, 0);
  const [hoverPage, setHoverPage] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const readCount = pageMs.filter((ms) => ms > 0).length;
  const totalMs = pageMs.reduce((a, b) => a + b, 0);
  const totalPages = pageMs.length;

  const focusPage = useMemo(() => {
    if (recentPage >= 1 && recentPage <= totalPages) return recentPage;
    for (let i = totalPages - 1; i >= 0; i--) {
      if (pageMs[i] > 0) return i + 1;
    }
    return 1;
  }, [recentPage, pageMs, totalPages]);

  const windowRange = useMemo(
    () => pageHeatWindow(totalPages, focusPage),
    [totalPages, focusPage],
  );

  const canCollapse = totalPages > PAGE_HEAT_WINDOW;
  const showStart = expanded || !canCollapse ? 1 : windowRange.start;
  const showEnd = expanded || !canCollapse ? totalPages : windowRange.end;
  const visiblePages = useMemo(() => {
    const list: { page: number; ms: number }[] = [];
    for (let page = showStart; page <= showEnd; page++) {
      list.push({ page, ms: pageMs[page - 1] ?? 0 });
    }
    return list;
  }, [pageMs, showStart, showEnd]);

  const markStats = useMemo(() => {
    let notePages = 0;
    let annotationPages = 0;
    if (!pageMarks) return { notePages, annotationPages };
    for (const counts of Object.values(pageMarks)) {
      if (counts.notes > 0) notePages += 1;
      if (counts.annotations > 0) annotationPages += 1;
    }
    return { notePages, annotationPages };
  }, [pageMarks]);

  if (pageMs.length === 0) {
    return (
      <section className="rounded-2xl border border-[#e7e2d9] bg-white px-5 py-5 shadow-sm sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight">页码阅读热力图</h2>
        <p className="mt-3 text-sm leading-6 text-[#78716c]">
          暂无带页码的阅读记录。打开 PDF 阅读超过 3 秒后会出现在这里。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e7e2d9] bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">页码阅读热力图</h2>
          <p className="mt-1 text-sm text-[#78716c]">
            共 {totalPages} 页 · 已阅读 {readCount} 页 · 累计{" "}
            {formatDurationDetailed(totalMs)}
            {canCollapse && !expanded
              ? ` · 显示第 ${showStart}–${showEnd} 页（最近阅读附近）`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#78716c]">
            <span className="inline-flex items-center gap-1.5">
              <span>少</span>
              <span className="flex gap-0.5">
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <span
                    key={t}
                    className="h-3 w-3 rounded-sm"
                    style={{
                      backgroundColor:
                        t === 0
                          ? PAGE_HEAT_EMPTY
                          : `rgba(${PAGE_HEAT_RGB}, ${0.18 + 0.82 * t})`,
                    }}
                  />
                ))}
              </span>
              <span>多</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: MARK_NOTE }}
              />
              笔记
              {markStats.notePages > 0 ? ` ${markStats.notePages}` : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: MARK_ANNOTATION }}
              />
              标注
              {markStats.annotationPages > 0
                ? ` ${markStats.annotationPages}`
                : ""}
            </span>
          </div>
          {canCollapse ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-1.5 text-sm text-[#3f3f46] hover:bg-[#f4f4f5]"
            >
              {expanded ? "收起至附近 100 页" : `展开全部 ${totalPages} 页`}
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="mt-5 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${Math.min(PAGE_HEAT_COLS, visiblePages.length)}, minmax(0, 1fr))`,
        }}
      >
        {visiblePages.map(({ page, ms }) => {
          const intensity =
            ms <= 0 ? 0 : 0.18 + 0.82 * (ms / Math.max(maxMs, 1));
          const active = hoverPage === page;
          const isFocus = page === focusPage;
          const marks = pageMarkOf(pageMarks, page);
          const href = buildPdfHref({ fileName, pageNumber: page });
          const tipParts = [
            `第 ${page} 页`,
            formatDurationDetailed(ms),
            marks.notes > 0 ? `笔记 ${marks.notes}` : "",
            marks.annotations > 0 ? `标注 ${marks.annotations}` : "",
            isFocus ? "最近阅读" : "",
          ].filter(Boolean);
          return (
            <Link
              key={page}
              href={href}
              className="relative block"
              onMouseEnter={() => setHoverPage(page)}
              onMouseLeave={() => setHoverPage(null)}
              title={tipParts.join(" · ")}
              aria-label={`跳转到第 ${page} 页`}
            >
              {active ? (
                <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#18181b] px-2 py-1 text-[11px] text-white shadow-sm">
                  {tipParts.join(" · ")}
                </div>
              ) : null}
              <div
                className="relative aspect-square overflow-hidden rounded-sm transition-shadow hover:brightness-95"
                style={{
                  backgroundColor:
                    ms > 0
                      ? `rgba(${PAGE_HEAT_RGB}, ${intensity})`
                      : PAGE_HEAT_EMPTY,
                  boxShadow:
                    active || isFocus
                      ? `inset 0 0 0 2px rgb(${PAGE_HEAT_RGB})`
                      : undefined,
                }}
              >
                {(marks.notes > 0 || marks.annotations > 0) && (
                  <span className="absolute right-0.5 top-0.5 flex gap-0.5">
                    {marks.notes > 0 ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full ring-1 ring-white/80"
                        style={{ backgroundColor: MARK_NOTE }}
                      />
                    ) : null}
                    {marks.annotations > 0 ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full ring-1 ring-white/80"
                        style={{ backgroundColor: MARK_ANNOTATION }}
                      />
                    ) : null}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function ActivityDetailClient({
  fileName,
  fileSessions,
  monthAllSessions,
  totalPages = 0,
  recentPage = 0,
  pageMarks,
  initialYear,
  initialMonth,
}: ActivityDetailClientProps) {
  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [rangeMode, setRangeMode] = useState<RangeMode>("day");
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [sessions, setSessions] = useState(fileSessions);
  const [allMonthSessions, setAllMonthSessions] = useState(monthAllSessions);
  const [clearing, setClearing] = useState(false);
  const isFileScope = Boolean(fileName?.trim());

  useEffect(() => {
    setSessions(fileSessions);
  }, [fileSessions]);

  useEffect(() => {
    setAllMonthSessions(monthAllSessions);
  }, [monthAllSessions]);

  const chart = useMemo(() => {
    if (rangeMode === "day") {
      const values = hourlyMsForDay(sessions, selectedDay);
      return {
        values,
        labels: values.map((_, i) => String(i)),
        total: values.reduce((a, b) => a + b, 0),
        highlightIndex: null as number | null,
      };
    }
    if (rangeMode === "week") {
      const values = dailyMsForWeek(sessions, selectedDay);
      return {
        values,
        labels: [...WEEKDAY_LABELS],
        total: values.reduce((a, b) => a + b, 0),
        highlightIndex: null as number | null,
      };
    }
    if (rangeMode === "month") {
      const values = dailyMsForMonth(sessions, year, month);
      const labels = values.map((_, i) => String(i + 1));
      const highlight =
        selectedDay.getFullYear() === year && selectedDay.getMonth() + 1 === month
          ? selectedDay.getDate() - 1
          : null;
      return {
        values,
        labels,
        total: values.reduce((a, b) => a + b, 0),
        highlightIndex: highlight,
      };
    }
    const values = monthlyMsForYear(sessions, year);
    return {
      values,
      labels: values.map((_, i) => String(i + 1)),
      total: values.reduce((a, b) => a + b, 0),
      highlightIndex: month - 1,
    };
  }, [rangeMode, sessions, selectedDay, year, month]);

  const monthDaily = useMemo(
    () => dailyMsForMonth(sessions, year, month),
    [sessions, year, month],
  );

  const monthFileTotal = useMemo(
    () => monthDaily.reduce((a, b) => a + b, 0),
    [monthDaily],
  );

  const monthLongest = useMemo(() => {
    let bestDay = 0;
    let bestMs = 0;
    monthDaily.forEach((ms, i) => {
      if (ms > bestMs) {
        bestMs = ms;
        bestDay = i + 1;
      }
    });
    return { day: bestDay, ms: bestMs };
  }, [monthDaily]);

  const monthAllTotal = useMemo(() => {
    const days = dailyMsForMonth(allMonthSessions, year, month);
    return days.reduce((a, b) => a + b, 0);
  }, [allMonthSessions, year, month]);

  const pageMs = useMemo(
    () => (isFileScope ? pageMsTotals(sessions, totalPages) : []),
    [isFileScope, sessions, totalPages],
  );

  const sharePct =
    monthAllTotal > 0 ? ((monthFileTotal / monthAllTotal) * 100).toFixed(2) : "0.00";

  const dateLabel = useMemo(() => {
    const now = new Date();
    if (rangeMode === "day") {
      return isSameLocalDay(selectedDay, now) ? "今天" : dayKeyFromDate(selectedDay);
    }
    if (rangeMode === "week") {
      const dow = selectedDay.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(
        selectedDay.getFullYear(),
        selectedDay.getMonth(),
        selectedDay.getDate() + mondayOffset,
      );
      const sunday = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 6,
      );
      return `${dayKeyFromDate(monday)} ~ ${dayKeyFromDate(sunday)}`;
    }
    if (rangeMode === "month") {
      return `${year}-${String(month).padStart(2, "0")}`;
    }
    return String(year);
  }, [rangeMode, selectedDay, year, month]);

  async function loadMonthAll(nextYear: number, nextMonth: number) {
    const res = await fetch(
      `/api/dwell?year=${nextYear}&month=${nextMonth}&limit=5000`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      ok?: boolean;
      items?: { startedAt: string | number | Date; durationMs: number }[];
    };
    if (!data.ok || !Array.isArray(data.items)) return;
    setAllMonthSessions(
      data.items.map((item) => ({
        startedAt:
          typeof item.startedAt === "number"
            ? item.startedAt
            : new Date(item.startedAt).getTime(),
        durationMs: item.durationMs,
      })),
    );
  }

  async function onClearMonth() {
    const scopeLabel = isFileScope ? `「${fileName}」` : "全部应用";
    if (
      !window.confirm(
        `确定清空${scopeLabel}在 ${year} 年 ${month} 月的停留统计？此操作不可恢复。`,
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const qs = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (isFileScope && fileName) {
        qs.set("resourceKey", fileName);
      }
      const res = await fetch(`/api/dwell?${qs}`, { method: "DELETE" });
      if (!res.ok) return;
      const start = new Date(year, month - 1, 1).getTime();
      const end = new Date(year, month, 1).getTime();
      setSessions((prev) =>
        prev.filter((s) => {
          const t = typeof s.startedAt === "number" ? s.startedAt : Number(s.startedAt);
          return t < start || t >= end;
        }),
      );
      await loadMonthAll(year, month);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setClearing(false);
    }
  }

  async function selectMonth(nextMonth: number) {
    setMonth(nextMonth);
    setSelectedDay(new Date(year, nextMonth - 1, Math.min(selectedDay.getDate(), 28)));
    await loadMonthAll(year, nextMonth);
  }

  async function selectYear(nextYear: number) {
    setYear(nextYear);
    setSelectedDay(
      new Date(nextYear, month - 1, Math.min(selectedDay.getDate(), 28)),
    );
    await loadMonthAll(nextYear, month);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* 左侧：时长统计 */}
      <section className="rounded-2xl border border-[#e7e2d9] bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">时长统计</h2>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              {RANGE_TABS.map((tab) => {
                const active = rangeMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRangeMode(tab.id)}
                    className={`relative pb-1 transition-colors ${
                      active ? "font-medium text-[#4f46e5]" : "text-[#78716c] hover:text-[#1c1917]"
                    }`}
                  >
                    {tab.label}
                    {active ? (
                      <span
                        className="absolute -bottom-0.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-b-[5px] border-x-transparent border-b-[#4f46e5]"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-1.5 text-sm text-[#3f3f46] hover:bg-[#f4f4f5]"
            >
              <CalendarIcon className="h-4 w-4 text-[#71717a]" />
              {dateLabel}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              value={dayKeyFromDate(selectedDay)}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const [y, m, d] = v.split("-").map(Number);
                const next = new Date(y, m - 1, d);
                setSelectedDay(next);
                setYear(next.getFullYear());
                setMonth(next.getMonth() + 1);
                void loadMonthAll(next.getFullYear(), next.getMonth() + 1);
              }}
            />
          </div>
        </div>

        <p className="mt-6 text-sm text-[#78716c]">
          总计{" "}
          <span className="ml-1 text-2xl font-medium text-[#27272a] tabular-nums">
            {formatDurationMs(chart.total)}
          </span>
        </p>

        <BarChart
          values={chart.values}
          labels={chart.labels}
          highlightIndex={chart.highlightIndex}
        />
      </section>

      {/* 右侧：月度总览 */}
      <section className="rounded-2xl border border-[#e7e2d9] bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">月度总览</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-1.5 text-sm text-[#3f3f46]">
              <CalendarIcon className="h-4 w-4 text-[#71717a]" />
              <select
                className="bg-transparent outline-none"
                value={year}
                onChange={(e) => void selectYear(Number(e.target.value))}
              >
                {Array.from({ length: 6 }, (_, i) => initialYear - 2 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={clearing || pending}
              onClick={() => void onClearMonth()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#e11d48] px-3 py-1.5 text-sm text-white hover:bg-[#be123c] disabled:opacity-60"
            >
              <TrashIcon className="h-4 w-4" />
              清空该月统计
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const active = m === month;
            return (
              <button
                key={m}
                type="button"
                onClick={() => void selectMonth(m)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums transition-colors ${
                  active
                    ? "bg-[#4f46e5] text-white"
                    : "bg-[#f4f4f5] text-[#52525b] hover:bg-[#e4e4e7]"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <Heatmap
            year={year}
            month={month}
            dailyMs={monthDaily}
            selectedDay={selectedDay}
            onSelectDay={(d) => {
              setSelectedDay(d);
              setRangeMode("day");
            }}
          />

          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-44">
            <div
              className="relative overflow-hidden rounded-xl px-3.5 py-3 pr-12 text-sm leading-6 text-[#312e81]"
              style={{ backgroundColor: ACCENT_SOFT }}
            >
              <p>
                该月累计使用{" "}
                <span className="font-medium tabular-nums">
                  {formatDurationMs(monthFileTotal)}
                </span>
              </p>
              <p className="mt-1 text-xs text-[#6366f1]/90">
                {monthLongest.ms > 0
                  ? `最长一天是在 ${String(monthLongest.day).padStart(2, "0")} 号，使用了 ${formatDurationMs(monthLongest.ms)}`
                  : "本月暂无使用记录"}
              </p>
              <CalendarIcon className="pointer-events-none absolute right-2 bottom-2 h-10 w-10 text-[#a5b4fc]/50" />
            </div>

            {isFileScope ? (
              <div
                className="relative overflow-hidden rounded-xl px-3.5 py-3 text-sm leading-6 text-[#312e81]"
                style={{ backgroundColor: ACCENT_SOFT }}
              >
                <p className="text-xs text-[#6366f1]">在当月所有使用应用时长中占比</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-[#312e81]">
                  {sharePct}%
                </p>
                <div
                  className="pointer-events-none absolute right-2 bottom-2 h-10 w-10 rounded-md"
                  style={{ backgroundColor: ACCENT_MUTED, opacity: 0.55 }}
                  aria-hidden
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {isFileScope && fileName ? (
        <div className="lg:col-span-2">
          <PageReadingHeatmap
            pageMs={pageMs}
            fileName={fileName}
            recentPage={recentPage}
            pageMarks={pageMarks}
          />
        </div>
      ) : null}
    </div>
  );
}
