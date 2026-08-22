"use client";

import { useEffect, useRef } from "react";
import { decideDwellIdle, DWELL_IDLE_MS } from "./idle";

/** 失焦后在该时长内切回，视作未切换，仍属同一段 */
export const DWELL_FOCUS_GAP_MS = 3 * 60 * 1000;
export { DWELL_IDLE_MS };

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

type DwellPayload = {
  clientSessionId: string;
  pagePath: string;
  resourceKey: string | null;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
};

type Options = {
  pagePath: string;
  resourceKey?: string | null;
  /** 为 false 时不采集 */
  enabled?: boolean;
  /** 失焦拆段阈值；小于该间隔切回则视作未切换，默认 3 分钟 */
  gapMs?: number;
  /** 进行中心跳上报间隔，避免异常退出丢数据 */
  heartbeatMs?: number;
  /** 无操作超过该时长视为未阅读；0 关闭。默认 5 分钟 */
  idleMs?: number;
};

function newSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dwell-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(payload: DwellPayload, keepalive = false) {
  const body = JSON.stringify(payload);
  if (keepalive && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/dwell", blob)) return;
  }
  void fetch("/api/dwell", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive,
  }).catch(() => {
    // 忽略网络错误，避免打断阅读
  });
}

/**
 * 页面停留 / 学习时长采集：
 * - 打开页面开始计时
 * - 离开页面、切站、或失焦：先记离开时刻
 * - 在 gapMs（默认 3 分钟）内切回：视作未切换，同一段继续
 * - 超过 gapMs 再切回：结束上一段，重新开始计时
 * - 页面仍在前台但 idleMs（默认 5 分钟）内无操作：视为未阅读，在最后一次操作处结束；再次操作才重新计时
 */
export function usePageDwell({
  pagePath,
  resourceKey = null,
  enabled = true,
  gapMs = DWELL_FOCUS_GAP_MS,
  heartbeatMs = 30_000,
  idleMs = DWELL_IDLE_MS,
}: Options) {
  const gapMsRef = useRef(gapMs);
  gapMsRef.current = gapMs;
  const idleMsRef = useRef(idleMs);
  idleMsRef.current = idleMs;

  useEffect(() => {
    if (!enabled || !pagePath) return;

    const resolvedKey = resourceKey ?? null;
    // /pdf 未打开文件时不计时、不落库
    if (pagePath === "/pdf" && resolvedKey == null) return;
    let clientSessionId = "";
    let startedAt = 0;
    let lastActivityAt = 0;
    let blurredAt: number | null = null;
    let ended = false;
    let hasSession = false;
    let idleTimer = 0;

    const buildPayload = (endedAt: number | null): DwellPayload => {
      const end = endedAt ?? Date.now();
      return {
        clientSessionId,
        pagePath,
        resourceKey: resolvedKey,
        startedAt,
        endedAt,
        durationMs: Math.max(0, end - startedAt),
      };
    };

    const clearIdleTimer = () => {
      if (!idleTimer) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    };

    const endSession = (at: number, keepalive = false) => {
      if (!hasSession || ended) return;
      ended = true;
      clearIdleTimer();
      persist(
        {
          ...buildPayload(at),
          endedAt: at,
          durationMs: Math.max(0, at - startedAt),
        },
        keepalive,
      );
    };

    const checkIdle = () => {
      if (!hasSession || ended || blurredAt != null) return;
      const decision = decideDwellIdle(Date.now(), lastActivityAt, idleMsRef.current);
      if (decision.idle) {
        endSession(decision.endedAt);
        return;
      }
      if (!Number.isFinite(decision.remainingMs)) return;
      idleTimer = window.setTimeout(checkIdle, decision.remainingMs);
    };

    const armIdleTimer = () => {
      clearIdleTimer();
      const limit = idleMsRef.current;
      if (limit <= 0 || !hasSession || ended || blurredAt != null) return;
      idleTimer = window.setTimeout(checkIdle, limit);
    };

    const startSession = (at = Date.now()) => {
      clientSessionId = newSessionId();
      startedAt = at;
      lastActivityAt = at;
      blurredAt = null;
      ended = false;
      hasSession = true;
      persist({ ...buildPayload(null), durationMs: 0, endedAt: null });
      armIdleTimer();
    };

    const saveProgress = (keepalive = false) => {
      if (!hasSession || ended || blurredAt != null) return;
      const decision = decideDwellIdle(Date.now(), lastActivityAt, idleMsRef.current);
      if (decision.idle) {
        endSession(decision.endedAt, keepalive);
        return;
      }
      const now = Date.now();
      persist(
        {
          ...buildPayload(null),
          endedAt: null,
          durationMs: Math.max(0, now - startedAt),
        },
        keepalive,
      );
    };

    const markActivity = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      lastActivityAt = now;
      if (blurredAt != null) return;
      if (!hasSession || ended) {
        startSession(now);
        return;
      }
    };

    const onHidden = () => {
      if (!hasSession || ended || blurredAt != null) return;
      clearIdleTimer();
      const now = Date.now();
      // 暂存离开时刻；是否拆段等切回后再定
      persist(
        {
          ...buildPayload(now),
          endedAt: now,
          durationMs: Math.max(0, now - startedAt),
        },
        true,
      );
      blurredAt = now;
    };

    const onVisible = () => {
      if (!hasSession) {
        startSession(Date.now());
        return;
      }
      // 空闲结束后仍在前台：切回焦点不算阅读，等操作再计
      if (ended) {
        if (blurredAt == null) return;
        blurredAt = null;
        startSession(Date.now());
        return;
      }
      if (blurredAt == null) return;
      const leftAt = blurredAt;
      blurredAt = null;
      lastActivityAt = Date.now();
      if (Date.now() - leftAt >= gapMsRef.current) {
        endSession(leftAt);
        startSession(Date.now());
        return;
      }
      // < gapMs：视作未切换，同一段继续
      ended = false;
      persist({
        ...buildPayload(null),
        endedAt: null,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      armIdleTimer();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHidden();
      else onVisible();
    };

    const onWindowBlur = () => {
      if (document.visibilityState === "hidden") return;
      onHidden();
    };

    const onWindowFocus = () => {
      if (document.visibilityState === "hidden") return;
      onVisible();
    };

    const onPageHide = () => {
      const decision = decideDwellIdle(Date.now(), lastActivityAt, idleMsRef.current);
      const at = decision.idle ? decision.endedAt : (blurredAt ?? Date.now());
      endSession(at, true);
    };

    const initiallyHidden =
      typeof document !== "undefined" &&
      (document.visibilityState === "hidden" ||
        (typeof document.hasFocus === "function" && !document.hasFocus()));

    if (!initiallyHidden) {
      startSession();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("pagehide", onPageHide);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { capture: true, passive: true });
    }

    const heartbeat = window.setInterval(() => saveProgress(), heartbeatMs);

    return () => {
      window.clearInterval(heartbeat);
      clearIdleTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pagehide", onPageHide);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity, { capture: true });
      }
      const decision = decideDwellIdle(Date.now(), lastActivityAt, idleMsRef.current);
      const at = decision.idle ? decision.endedAt : (blurredAt ?? Date.now());
      endSession(at, true);
    };
  }, [enabled, pagePath, resourceKey, heartbeatMs]);
}
