"use client";

import { useEffect, useRef } from "react";

/** 失焦后在该时长内切回，视作未切换，仍属同一段 */
export const DWELL_FOCUS_GAP_MS = 3 * 60 * 1000;

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
 */
export function usePageDwell({
  pagePath,
  resourceKey = null,
  enabled = true,
  gapMs = DWELL_FOCUS_GAP_MS,
  heartbeatMs = 30_000,
}: Options) {
  const gapMsRef = useRef(gapMs);
  gapMsRef.current = gapMs;

  useEffect(() => {
    if (!enabled || !pagePath) return;

    const resolvedKey = resourceKey ?? null;
    let clientSessionId = "";
    let startedAt = 0;
    let blurredAt: number | null = null;
    let ended = false;
    let hasSession = false;

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

    const startSession = (at = Date.now()) => {
      clientSessionId = newSessionId();
      startedAt = at;
      blurredAt = null;
      ended = false;
      hasSession = true;
      persist({ ...buildPayload(null), durationMs: 0, endedAt: null });
    };

    const endSession = (at: number, keepalive = false) => {
      if (!hasSession || ended) return;
      ended = true;
      persist(
        {
          ...buildPayload(at),
          endedAt: at,
          durationMs: Math.max(0, at - startedAt),
        },
        keepalive,
      );
    };

    const saveProgress = (keepalive = false) => {
      if (!hasSession || ended || blurredAt != null) return;
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

    const onHidden = () => {
      if (!hasSession || ended || blurredAt != null) return;
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
      if (blurredAt == null) return;
      const leftAt = blurredAt;
      blurredAt = null;
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
      endSession(blurredAt ?? Date.now(), true);
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

    const heartbeat = window.setInterval(() => saveProgress(), heartbeatMs);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pagehide", onPageHide);
      endSession(blurredAt ?? Date.now(), true);
    };
  }, [enabled, pagePath, resourceKey, heartbeatMs]);
}
