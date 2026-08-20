"use client";

import { useEffect, useRef } from "react";

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
 * - 离开页面、切到其他网站、或切到其他软件（失焦）时结束本段
 * - 再次打开或从其他页面/软件切回时重新开始计时（新的一段）
 */
export function usePageDwell({
  pagePath,
  resourceKey = null,
  enabled = true,
  heartbeatMs = 30_000,
}: Options) {
  const heartbeatMsRef = useRef(heartbeatMs);
  heartbeatMsRef.current = heartbeatMs;

  useEffect(() => {
    if (!enabled || !pagePath) return;

    const resolvedKey = resourceKey ?? null;
    let clientSessionId = "";
    let startedAt = 0;
    /** 当前是否处于「失焦已结束本段、等待回来再开新段」 */
    let inactive = false;
    let ended = false;

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
      inactive = false;
      ended = false;
      persist({ ...buildPayload(null), durationMs: 0, endedAt: null });
    };

    const endSession = (at: number, keepalive = false) => {
      if (ended || inactive) return;
      ended = true;
      inactive = true;
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
      if (ended || inactive) return;
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

    const onInactive = () => {
      endSession(Date.now(), true);
    };

    const onActive = () => {
      if (!inactive) return;
      startSession(Date.now());
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onInactive();
      else onActive();
    };

    const onWindowBlur = () => {
      // 切标签页时 visibility 已处理；此处覆盖「页仍可见但窗口失焦」
      if (document.visibilityState === "hidden") return;
      onInactive();
    };

    const onWindowFocus = () => {
      if (document.visibilityState === "hidden") return;
      onActive();
    };

    const onPageHide = () => {
      endSession(Date.now(), true);
    };

    const initiallyHidden =
      typeof document !== "undefined" &&
      (document.visibilityState === "hidden" ||
        (typeof document.hasFocus === "function" && !document.hasFocus()));

    if (initiallyHidden) {
      inactive = true;
    } else {
      startSession();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("pagehide", onPageHide);

    const heartbeat = window.setInterval(() => saveProgress(), heartbeatMsRef.current);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pagehide", onPageHide);
      if (!inactive && !ended) {
        endSession(Date.now(), true);
      }
    };
  }, [enabled, pagePath, resourceKey]);
}
