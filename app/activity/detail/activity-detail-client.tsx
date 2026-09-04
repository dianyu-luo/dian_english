"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clipSlicesToRange,
  dailyMsForMonth,
  dailyMsForWeek,
  dayKeyFromDate,
  formatDurationDetailed,
  hourlyMsForDay,
  isSameLocalDay,
  localDayRange,
  localHourRange,
  localMonthRange,
  localWeekRange,
  localYearRange,
  monthlyMsForYear,
  pageMsTotals,
  type DwellSliceWithPage,
} from "@/lib/activity/aggregate-dwell";
import { formatDurationMs } from "@/lib/activity/format-duration";
import { formatRelativeTime } from "@/lib/activity/format-relative-time";
import type { PageMarksMap } from "@/lib/activity/page-marks-types";
import {
  recentEditColor,
  type RecentEditColor,
} from "@/lib/activity/recent-edit";
import { buildPdfHref } from "@/lib/pdf/jump-search";

/** 可序列化传入客户端的最近编辑项 */
export type RecentEditListItem = {
  key: string;
  kind: "note" | "mark" | "annotation";
  kindLabel: string;
  type: string;
  typeLabel: string;
  title: string;
  fileName: string;
  pageNumber: number;
  updatedAt: string;
  href: string;
};

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
  /** 本文件最近编辑（单击格子可按页筛选） */
  recentEdits?: RecentEditListItem[];
  initialYear: number;
  initialMonth: number;
};

type RangeMode = "day" | "week" | "month" | "year";

/** 根据时长统计的粒度 / 小时选中，得到页码热力图的时间窗 */
function resolvePageHeatRange(
  rangeMode: RangeMode,
  selectedDay: Date,
  year: number,
  month: number,
  selectedHour: number | null,
): { startMs: number; endMs: number; label: string } {
  if (rangeMode === "day") {
    if (selectedHour != null && selectedHour >= 0 && selectedHour <= 23) {
      const { startMs, endMs } = localHourRange(selectedDay, selectedHour);
      const day = dayKeyFromDate(selectedDay);
      const hh = String(selectedHour).padStart(2, "0");
      return {
        startMs,
        endMs,
        label: `${day} ${hh}:00–${hh}:59`,
      };
    }
    const { startMs, endMs } = localDayRange(selectedDay);
    return { startMs, endMs, label: dayKeyFromDate(selectedDay) };
  }

  if (rangeMode === "week") {
    const { startMs, endMs } = localWeekRange(selectedDay);
    const monday = new Date(startMs);
    const sunday = new Date(endMs - 1);
    return {
      startMs,
      endMs,
      label: `${dayKeyFromDate(monday)} ~ ${dayKeyFromDate(sunday)}`,
    };
  }

  if (rangeMode === "month") {
    const { startMs, endMs } = localMonthRange(year, month);
    return {
      startMs,
      endMs,
      label: `${year}-${String(month).padStart(2, "0")}`,
    };
  }

  const { startMs, endMs } = localYearRange(year);
  return { startMs, endMs, label: String(year) };
}

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

const RECENT_EDIT_BADGE: Record<RecentEditColor, string> = {
  word: "border-[#facc15] bg-[#fef9c3] text-[#854d0e]",
  question: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
  note: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
  bookmark: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
  todo: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]",
  annotation: "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c]",
};

/** 未选页时展示的最近条数 */
const RECENT_EDIT_DEFAULT_LIMIT = 20;

type PageMarkFilter = "all" | "notes" | "annotations";

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
  onSelectIndex,
}: {
  values: number[];
  labels: string[];
  highlightIndex?: number | null;
  onSelectIndex?: (index: number) => void;
}) {
  const maxVal = Math.max(...values, 0);
  const { scaleMax, ticks } = yAxisScale(maxVal);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const selectable = typeof onSelectIndex === "function";

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
            <button
              key={i}
              type="button"
              disabled={!selectable}
              className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end disabled:cursor-default"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={() => onSelectIndex?.(i)}
              aria-pressed={highlightIndex === i}
              title={
                selectable
                  ? `${labels[i]} · ${formatDurationDetailed(ms)}（点击筛选热力图）`
                  : undefined
              }
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
            </button>
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
  selectedPage,
  onSelectPage,
  rangeLabel,
}: {
  pageMs: number[];
  fileName: string;
  recentPage?: number;
  pageMarks?: PageMarksMap;
  selectedPage: number | null;
  onSelectPage: (page: number) => void;
  /** 当前筛选的时间范围文案，如「2026-09-04」 */
  rangeLabel?: string;
}) {
  const router = useRouter();
  const maxMs = Math.max(...pageMs, 0);
  const [hoverPage, setHoverPage] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<PageMarkFilter>("all");
  const readCount = pageMs.filter((ms) => ms > 0).length;
  const totalMs = pageMs.reduce((a, b) => a + b, 0);
  const totalPages = pageMs.length;

  const openPage = (page: number) => {
    router.push(buildPdfHref({ fileName, pageNumber: page }));
  };

  const selectPage = (page: number) => {
    setHoverPage(page);
    onSelectPage(page);
  };

  const focusPage = useMemo(() => {
    if (
      recentPage >= 1 &&
      recentPage <= totalPages &&
      (pageMs[recentPage - 1] ?? 0) > 0
    ) {
      return recentPage;
    }
    for (let i = totalPages - 1; i >= 0; i--) {
      if (pageMs[i] > 0) return i + 1;
    }
    if (recentPage >= 1 && recentPage <= totalPages) return recentPage;
    return 1;
  }, [recentPage, pageMs, totalPages]);

  const windowRange = useMemo(
    () => pageHeatWindow(totalPages, focusPage),
    [totalPages, focusPage],
  );

  const canCollapse = totalPages > PAGE_HEAT_WINDOW;
  const showStart = expanded || !canCollapse ? 1 : windowRange.start;
  const showEnd = expanded || !canCollapse ? totalPages : windowRange.end;

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

  const visiblePages = useMemo(() => {
    const list: {
      page: number;
      ms: number;
      notes: number;
      annotations: number;
      matched: boolean;
    }[] = [];
    for (let page = showStart; page <= showEnd; page++) {
      const marks = pageMarkOf(pageMarks, page);
      const matched =
        filter === "all" ||
        (filter === "notes" && marks.notes > 0) ||
        (filter === "annotations" && marks.annotations > 0);
      list.push({
        page,
        ms: pageMs[page - 1] ?? 0,
        notes: marks.notes,
        annotations: marks.annotations,
        matched,
      });
    }
    return list;
  }, [pageMs, pageMarks, showStart, showEnd, filter]);

  const markedInView = useMemo(
    () => visiblePages.filter((p) => p.notes > 0 || p.annotations > 0),
    [visiblePages],
  );

  const activePage = hoverPage ?? selectedPage ?? focusPage;
  const activeMarks = pageMarkOf(pageMarks, activePage);
  const activeMs = pageMs[activePage - 1] ?? 0;

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

  const filters: { id: PageMarkFilter; label: string; count?: number }[] = [
    { id: "all", label: "全部" },
    { id: "notes", label: "有笔记", count: markStats.notePages },
    { id: "annotations", label: "有标注", count: markStats.annotationPages },
  ];

  return (
    <section className="rounded-2xl border border-[#e7e2d9] bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">页码阅读热力图</h2>
          <p className="mt-1 text-sm text-[#78716c]">
            共 {totalPages} 页 · 已阅读 {readCount} 页 · 累计{" "}
            {formatDurationDetailed(totalMs)}
            {rangeLabel ? ` · ${rangeLabel}` : null}
            {canCollapse && !expanded
              ? ` · 显示第 ${showStart}–${showEnd} 页（最近阅读附近）`
              : null}
          </p>
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

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_12.5rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-4 text-sm">
            {filters.map((item) => {
              const on = filter === item.id;
              const disabled =
                item.id !== "all" && (item.count == null || item.count === 0);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setFilter(item.id)}
                  className={`relative pb-1 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    on
                      ? "font-medium text-[#1c1917]"
                      : "text-[#78716c] hover:text-[#1c1917]"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.id === "notes" ? (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: MARK_NOTE }}
                      />
                    ) : null}
                    {item.id === "annotations" ? (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: MARK_ANNOTATION }}
                      />
                    ) : null}
                    {item.label}
                    {item.count != null ? (
                      <span className="tabular-nums text-[#a8a29e]">
                        {item.count}
                      </span>
                    ) : null}
                  </span>
                  {on ? (
                    <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[#1c1917]" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            className="mt-4 grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.min(PAGE_HEAT_COLS, visiblePages.length)}, minmax(0, 1fr))`,
            }}
            onMouseLeave={() => setHoverPage(null)}
          >
            {visiblePages.map(({ page, ms, notes, annotations, matched }) => {
              const intensity =
                ms <= 0 ? 0 : 0.18 + 0.82 * (ms / Math.max(maxMs, 1));
              const isHover = hoverPage === page;
              const isSelected = selectedPage === page;
              const isFocus = page === focusPage;
              return (
                <button
                  key={page}
                  type="button"
                  className="relative block w-full cursor-pointer outline-none transition-opacity"
                  style={{ opacity: matched ? 1 : 0.16 }}
                  onMouseEnter={() => setHoverPage(page)}
                  onFocus={() => setHoverPage(page)}
                  onClick={() => selectPage(page)}
                  onDoubleClick={() => openPage(page)}
                  title={`第 ${page} 页 · 单击查看编辑 · 双击打开`}
                  aria-label={`第 ${page} 页，单击查看编辑，双击打开`}
                  aria-pressed={isSelected}
                >
                  <div
                    className="relative aspect-square overflow-hidden rounded-sm transition-shadow hover:brightness-95"
                    style={{
                      backgroundColor:
                        ms > 0
                          ? `rgba(${PAGE_HEAT_RGB}, ${intensity})`
                          : PAGE_HEAT_EMPTY,
                      boxShadow:
                        isHover || isSelected || isFocus
                          ? `inset 0 0 0 2px rgb(${PAGE_HEAT_RGB})`
                          : undefined,
                    }}
                  >
                    {(notes > 0 || annotations > 0) && (
                      <span className="absolute right-0.5 top-0.5 flex gap-0.5">
                        {notes > 0 ? (
                          <span
                            className="h-1.5 w-1.5 rounded-full ring-1 ring-white/80"
                            style={{ backgroundColor: MARK_NOTE }}
                          />
                        ) : null}
                        {annotations > 0 ? (
                          <span
                            className="h-1.5 w-1.5 rounded-full ring-1 ring-white/80"
                            style={{ backgroundColor: MARK_ANNOTATION }}
                          />
                        ) : null}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="flex flex-col border-t border-[#e7e2d9] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="text-[11px] tracking-wide text-[#a8a29e]">当前页</p>
          <p className="mt-1 text-3xl font-medium tabular-nums tracking-tight text-[#1c1917]">
            {activePage}
          </p>
          {/* 固定两行高度：阅读时长 + 笔记/标注，悬停切换时不撑布局 */}
          <div className="mt-2 h-11 text-sm leading-5 text-[#57534e]">
            <p className="truncate">
              {activeMs > 0
                ? `阅读 ${formatDurationDetailed(activeMs)}`
                : "尚无阅读时长"}
              {activePage === focusPage ? (
                <span className="text-[#a8a29e]"> · 最近</span>
              ) : null}
            </p>
            <p className="mt-1 flex h-5 items-center gap-2 text-xs">
              {activeMarks.notes > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: MARK_NOTE }}
                  />
                  笔记 {activeMarks.notes}
                </span>
              ) : null}
              {activeMarks.annotations > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: MARK_ANNOTATION }}
                  />
                  标注 {activeMarks.annotations}
                </span>
              ) : null}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-[#a8a29e]">
            单击查看该页编辑 · 双击打开
          </p>
          <Link
            href={buildPdfHref({ fileName, pageNumber: activePage })}
            className="mt-3 inline-block text-sm text-[#1c1917] underline underline-offset-4"
          >
            打开第 {activePage} 页
          </Link>

          <div className="mt-8">
            <p className="text-[11px] tracking-wide text-[#a8a29e]">
              本段有笔记 / 标注
            </p>
            {markedInView.length === 0 ? (
              <p className="mt-2 text-sm text-[#a8a29e]">暂无</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
                {markedInView.map((p) => (
                  <button
                    key={p.page}
                    type="button"
                    onMouseEnter={() => setHoverPage(p.page)}
                    onClick={() => selectPage(p.page)}
                    onDoubleClick={() => openPage(p.page)}
                    title={`第 ${p.page} 页 · 单击查看编辑 · 双击打开`}
                    className={`inline-flex items-center gap-1 text-sm tabular-nums underline-offset-2 hover:underline ${
                      p.page === activePage
                        ? "font-medium text-[#1c1917]"
                        : "text-[#78716c]"
                    }`}
                  >
                    {p.page}
                    {p.notes > 0 ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: MARK_NOTE }}
                      />
                    ) : null}
                    {p.annotations > 0 ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: MARK_ANNOTATION }}
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
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
  recentEdits = [],
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
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  /** 按天视图下选中的小时（0–23）；再次点击取消 */
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const isFileScope = Boolean(fileName?.trim());

  const displayedEdits = useMemo(() => {
    if (selectedPage == null) {
      return recentEdits.slice(0, RECENT_EDIT_DEFAULT_LIMIT);
    }
    return recentEdits.filter((item) => item.pageNumber === selectedPage);
  }, [recentEdits, selectedPage]);

  useEffect(() => {
    setSessions(fileSessions);
  }, [fileSessions]);

  useEffect(() => {
    setAllMonthSessions(monthAllSessions);
  }, [monthAllSessions]);

  const chart = useMemo(() => {
    if (rangeMode === "day") {
      const values = hourlyMsForDay(sessions, selectedDay);
      const total =
        selectedHour != null && selectedHour >= 0 && selectedHour <= 23
          ? values[selectedHour] ?? 0
          : values.reduce((a, b) => a + b, 0);
      return {
        values,
        labels: values.map((_, i) => String(i)),
        total,
        highlightIndex: selectedHour,
      };
    }
    if (rangeMode === "week") {
      const values = dailyMsForWeek(sessions, selectedDay);
      const dow = selectedDay.getDay();
      const mondayIndex = dow === 0 ? 6 : dow - 1;
      return {
        values,
        labels: [...WEEKDAY_LABELS],
        total: values.reduce((a, b) => a + b, 0),
        highlightIndex: mondayIndex,
      };
    }
    if (rangeMode === "month") {
      const values = dailyMsForMonth(sessions, year, month);
      const labels = values.map((_, i) => String(i + 1));
      const highlight =
        selectedDay.getFullYear() === year &&
        selectedDay.getMonth() + 1 === month
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
  }, [rangeMode, sessions, selectedDay, year, month, selectedHour]);

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

  const pageHeatRange = useMemo(
    () =>
      resolvePageHeatRange(
        rangeMode,
        selectedDay,
        year,
        month,
        selectedHour,
      ),
    [rangeMode, selectedDay, year, month, selectedHour],
  );

  const pageMs = useMemo(() => {
    if (!isFileScope) return [];
    const clipped = clipSlicesToRange(
      sessions,
      pageHeatRange.startMs,
      pageHeatRange.endMs,
    );
    return pageMsTotals(clipped, totalPages);
  }, [isFileScope, sessions, totalPages, pageHeatRange]);

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
    setSelectedHour(null);
    setSelectedDay(new Date(year, nextMonth - 1, Math.min(selectedDay.getDate(), 28)));
    await loadMonthAll(year, nextMonth);
  }

  async function selectYear(nextYear: number) {
    setYear(nextYear);
    setSelectedHour(null);
    setSelectedDay(
      new Date(nextYear, month - 1, Math.min(selectedDay.getDate(), 28)),
    );
    await loadMonthAll(nextYear, month);
  }

  function onSelectChartBar(index: number) {
    if (rangeMode === "day") {
      setSelectedHour((prev) => (prev === index ? null : index));
      return;
    }
    if (rangeMode === "week") {
      const { startMs } = localWeekRange(selectedDay);
      const monday = new Date(startMs);
      const next = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + index,
      );
      setSelectedDay(next);
      setYear(next.getFullYear());
      setMonth(next.getMonth() + 1);
      setSelectedHour(null);
      setRangeMode("day");
      void loadMonthAll(next.getFullYear(), next.getMonth() + 1);
      return;
    }
    if (rangeMode === "month") {
      const next = new Date(year, month - 1, index + 1);
      setSelectedDay(next);
      setSelectedHour(null);
      setRangeMode("day");
      return;
    }
    const nextMonth = index + 1;
    setMonth(nextMonth);
    setSelectedHour(null);
    setSelectedDay(
      new Date(year, nextMonth - 1, Math.min(selectedDay.getDate(), 28)),
    );
    setRangeMode("month");
    void loadMonthAll(year, nextMonth);
  }

  return (
    <>
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
                    onClick={() => {
                      setRangeMode(tab.id);
                      setSelectedHour(null);
                    }}
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
                setSelectedHour(null);
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
          onSelectIndex={onSelectChartBar}
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
              setSelectedHour(null);
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
            selectedPage={selectedPage}
            onSelectPage={setSelectedPage}
            rangeLabel={pageHeatRange.label}
          />
        </div>
      ) : null}
    </div>

    {isFileScope ? (
      <section className="mt-12 space-y-3 border-t border-[#d6d3d1] pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">
              {selectedPage != null
                ? `第 ${selectedPage} 页编辑内容`
                : "最近编辑内容"}
            </h2>
            {selectedPage != null ? (
              <p className="mt-1 text-sm text-[#78716c]">
                来自上方热力图选中的页
              </p>
            ) : null}
          </div>
          {selectedPage != null ? (
            <button
              type="button"
              onClick={() => setSelectedPage(null)}
              className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3 py-1.5 text-sm text-[#3f3f46] hover:bg-[#f4f4f5]"
            >
              显示全部最近编辑
            </button>
          ) : null}
        </div>
        {displayedEdits.length === 0 ? (
          <p className="text-sm leading-6 text-[#78716c]">
            {selectedPage != null
              ? "本页暂无笔记、标记或批注。"
              : "本文件暂无笔记、标记或批注。"}
          </p>
        ) : (
          <div className="border-y border-[#e7e2d9]">
            <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_10.5rem] gap-4 border-b border-[#e7e2d9] py-2 text-xs text-[#78716c] sm:grid">
              <span>内容</span>
              <span className="text-right">类型</span>
              <span className="text-right">最近更新</span>
            </div>
            <ul className="divide-y divide-[#e7e2d9]">
              {displayedEdits.map((item) => {
                const time = formatRelativeTime(item.updatedAt);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="grid grid-cols-1 gap-1 py-3 hover:bg-[#f0ebe3]/70 sm:grid-cols-[minmax(0,1fr)_7.5rem_10.5rem] sm:items-center sm:gap-4"
                    >
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[#1c1917]">
                        {item.title}
                      </span>
                      <span className="sm:flex sm:justify-end">
                        <span
                          className={`inline-flex whitespace-nowrap border px-1.5 py-0.5 text-xs ${RECENT_EDIT_BADGE[recentEditColor(item)]}`}
                        >
                          {item.kindLabel} · {item.typeLabel}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-xs text-[#a8a29e] sm:text-right">
                        第 {item.pageNumber} 页
                        {time ? ` · ${time}` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    ) : null}
    </>
  );
}
