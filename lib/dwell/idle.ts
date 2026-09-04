/** 无操作超过此时长，视为未阅读：结束当前段，且不计入空闲时间 */
export const DWELL_IDLE_MS = 5 * 60 * 1000;

/** 短于此时长的停留不写入数据库 */
export const DWELL_MIN_MS = 3_000;

export type DwellIdleDecision =
  | { idle: false; remainingMs: number }
  | { idle: true; endedAt: number };

/** 根据最后一次操作判断是否已空闲，以及应在何时结束计时 */
export function decideDwellIdle(
  now: number,
  lastActivityAt: number,
  idleMs: number,
): DwellIdleDecision {
  if (idleMs <= 0) {
    return { idle: false, remainingMs: Number.POSITIVE_INFINITY };
  }
  const remainingMs = idleMs - (now - lastActivityAt);
  if (remainingMs <= 0) {
    return { idle: true, endedAt: lastActivityAt };
  }
  return { idle: false, remainingMs };
}
