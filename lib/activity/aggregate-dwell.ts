/** 一段停留：用 startedAt + durationMs 作为有效区间 */
export type DwellSlice = {
  startedAt: number | Date;
  durationMs: number;
};

/** 带可选页码的停留（用于页码热力图） */
export type DwellSliceWithPage = DwellSlice & {
  pageNumber?: number | null;
};

/**
 * 按页码汇总停留时长。
 * pageCount 已知时返回 1..pageCount；未知时按出现过的最大页码。
 */
export function pageMsTotals(
  slices: DwellSliceWithPage[],
  pageCount = 0,
): number[] {
  let maxPage = Math.max(0, Math.floor(pageCount));
  const byPage = new Map<number, number>();

  for (const slice of slices) {
    const page = slice.pageNumber;
    if (typeof page !== "number" || !Number.isFinite(page) || page < 1) continue;
    const p = Math.floor(page);
    const ms = Math.max(0, Math.round(slice.durationMs));
    if (!Number.isFinite(ms) || ms <= 0) continue;
    byPage.set(p, (byPage.get(p) ?? 0) + ms);
    if (p > maxPage) maxPage = p;
  }

  if (maxPage < 1) return [];
  return Array.from({ length: maxPage }, (_, i) => byPage.get(i + 1) ?? 0);
}

/**
 * 将停留片段裁剪到 [rangeStartMs, rangeEndMs)（右开）。
 * 跨边界的片段会按重叠时长截断。
 */
export function clipSlicesToRange<T extends DwellSlice>(
  slices: T[],
  rangeStartMs: number,
  rangeEndMs: number,
): T[] {
  if (!(rangeEndMs > rangeStartMs)) return [];
  const out: T[] = [];
  for (const slice of slices) {
    const start = toTime(slice.startedAt);
    if (!Number.isFinite(start)) continue;
    const duration = Math.max(0, Math.round(slice.durationMs));
    if (duration <= 0) continue;
    const end = start + duration;
    const overlapStart = Math.max(start, rangeStartMs);
    const overlapEnd = Math.min(end, rangeEndMs);
    if (overlapEnd > overlapStart) {
      out.push({
        ...slice,
        startedAt: overlapStart,
        durationMs: overlapEnd - overlapStart,
      });
    }
  }
  return out;
}

/** 本地某日 00:00–次日 00:00 */
export function localDayRange(day: Date): { startMs: number; endMs: number } {
  const start = startOfLocalDay(day);
  return { startMs: start.getTime(), endMs: addDays(start, 1).getTime() };
}

/** 本地某小时 [h, h+1) */
export function localHourRange(
  day: Date,
  hour: number,
): { startMs: number; endMs: number } {
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    h,
  );
  return { startMs: start.getTime(), endMs: start.getTime() + 3_600_000 };
}

/** 含 dayInWeek 的自然周（周一 00:00–下周一 00:00） */
export function localWeekRange(dayInWeek: Date): {
  startMs: number;
  endMs: number;
} {
  const day = startOfLocalDay(dayInWeek);
  const dow = day.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(day, mondayOffset);
  return { startMs: monday.getTime(), endMs: addDays(monday, 7).getTime() };
}

/** 本地某月 1 日 00:00–下月 1 日 00:00 */
export function localMonthRange(
  year: number,
  month: number,
): { startMs: number; endMs: number } {
  return {
    startMs: new Date(year, month - 1, 1).getTime(),
    endMs: new Date(year, month, 1).getTime(),
  };
}

/** 本地某年 1/1 00:00–次年 1/1 00:00 */
export function localYearRange(year: number): {
  startMs: number;
  endMs: number;
} {
  return {
    startMs: new Date(year, 0, 1).getTime(),
    endMs: new Date(year + 1, 0, 1).getTime(),
  };
}

function toTime(value: number | Date): number {
  return value instanceof Date ? value.getTime() : value;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 含秒的时长文案，如 `3分钟36秒`、`1小时26分` */
export function formatDurationDetailed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}秒`;

  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    if (minutes === 0) return `${hours}小时`;
    return `${hours}小时${minutes}分`;
  }
  if (seconds === 0) return `${minutes}分钟`;
  return `${minutes}分钟${seconds}秒`;
}

/** 将每段停留按时长切分到各本地日 / 小时桶 */
export function forEachDurationSlice(
  slices: DwellSlice[],
  onSlice: (dayKey: string, hour: number, ms: number, at: Date) => void,
): void {
  for (const slice of slices) {
    const start = toTime(slice.startedAt);
    const duration = Math.max(0, Math.round(slice.durationMs));
    if (!Number.isFinite(start) || duration <= 0) continue;

    let t = start;
    const end = start + duration;
    while (t < end) {
      const at = new Date(t);
      const hourStart = new Date(
        at.getFullYear(),
        at.getMonth(),
        at.getDate(),
        at.getHours(),
      );
      const nextHour = new Date(hourStart.getTime() + 3_600_000);
      const sliceEnd = Math.min(end, nextHour.getTime());
      const ms = sliceEnd - t;
      if (ms > 0) {
        const dayKey = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
        onSlice(dayKey, at.getHours(), ms, at);
      }
      t = sliceEnd;
    }
  }
}

export function sumDurationMs(slices: DwellSlice[]): number {
  let total = 0;
  for (const slice of slices) {
    const ms = Math.max(0, Math.round(slice.durationMs));
    if (Number.isFinite(ms)) total += ms;
  }
  return total;
}

/** 某日本地 0–23 点时长 */
export function hourlyMsForDay(slices: DwellSlice[], day: Date): number[] {
  const dayStart = startOfLocalDay(day);
  const key = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
  const hours = Array.from({ length: 24 }, () => 0);
  forEachDurationSlice(slices, (dayKey, hour, ms) => {
    if (dayKey === key) hours[hour] += ms;
  });
  return hours;
}

/** 周一为一周起始；返回 7 天（一…日）时长 */
export function dailyMsForWeek(slices: DwellSlice[], dayInWeek: Date): number[] {
  const day = startOfLocalDay(dayInWeek);
  const dow = day.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(day, mondayOffset);
  const days = Array.from({ length: 7 }, () => 0);
  const keys = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const index = new Map(keys.map((k, i) => [k, i]));
  forEachDurationSlice(slices, (dayKey, _hour, ms) => {
    const i = index.get(dayKey);
    if (i != null) days[i] += ms;
  });
  return days;
}

/** 某月每日时长，下标 0 = 1 号 */
export function dailyMsForMonth(
  slices: DwellSlice[],
  year: number,
  month: number,
): number[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, () => 0);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  forEachDurationSlice(slices, (dayKey, _hour, ms) => {
    if (!dayKey.startsWith(prefix)) return;
    const day = Number(dayKey.slice(-2));
    if (day >= 1 && day <= daysInMonth) days[day - 1] += ms;
  });
  return days;
}

/** 某年 1–12 月时长 */
export function monthlyMsForYear(slices: DwellSlice[], year: number): number[] {
  const months = Array.from({ length: 12 }, () => 0);
  forEachDurationSlice(slices, (_dayKey, _hour, ms, at) => {
    if (at.getFullYear() === year) months[at.getMonth()] += ms;
  });
  return months;
}

export function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
