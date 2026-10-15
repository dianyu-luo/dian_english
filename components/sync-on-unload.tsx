"use client";

import { useEffect } from "react";

/**
 * 关闭标签页 / 离开页面时触发一次数据库上传到 OneDrive。
 * 使用 keepalive，避免卸载时请求被取消；进入 bfcache 不传。
 */
export function SyncOnUnload() {
  useEffect(() => {
    let sent = false;

    const upload = () => {
      if (sent) return;
      sent = true;
      try {
        void fetch("/api/sync/upload", {
          method: "POST",
          keepalive: true,
        });
      } catch {
        // 忽略：卸载阶段无法可靠处理错误
      }
    };

    const onPageHide = (event: PageTransitionEvent) => {
      // 进往返缓存时页面还在，不算关闭
      if (event.persisted) return;
      upload();
    };

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
