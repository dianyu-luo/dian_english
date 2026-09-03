"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dailyMsForMonth,
  dailyMsForWeek,
  dayKeyFromDate,
  formatDurationDetailed,
  hourlyMsForDay,
  isSameLocalDay,
  monthlyMsForYear,
  type DwellSlice,
} from "@/lib/activity/aggregate-dwell";
import { formatDurationMs } from "@/lib/activity/format-duration";

export type ActivityDetailClientProps = {
  fileName: string;
  fileSessions: DwellSlice[];
  /** 当前所选月份内全部应用的停留（占比分母） */
  monthAllSessions: DwellSlice[];
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
          const active = highlightIndex === i;
          return (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <div
                className="w-[55%] max-w-5 rounded-t-sm transition-colors"
                style={{
                  height: `${h}%`,
                  backgroundColor: active || ms > 0 ? ACCENT : "transparent",
                  opacity: ms > 0 ? (active ? 1 : 0.85) : 0,
                }}
                title={`${labels[i]} · ${formatDurationDetailed(ms)}`}
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

export function ActivityDetailClient({
  fileName,
  fileSessions,
  monthAllSessions,
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
    if (
      !window.confirm(
        `确定清空「${fileName}」在 ${year} 年 ${month} 月的停留统计？此操作不可恢复。`,
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch(
        `/api/dwell?resourceKey=${encodeURIComponent(fileName)}&year=${year}&month=${month}`,
        { method: "DELETE" },
      );
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
              className="relative overflow-hidden rounded-xl px-3.5 py-3 text-sm leading-6 text-[#312e81]"
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
          </div>
        </div>
      </section>
    </div>
  );
}
