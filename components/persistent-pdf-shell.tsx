"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import PdfPageClient from "@/app/pdf/pdf-page-client";

/**
 * 首次进入 /pdf 后保持阅读器挂载。
 * 切到活动/设置等页面时只隐藏，避免 PDF 整页卸载再解析。
 * （与 /pdf/note 的 paused 策略一致）
 */
export function PersistentPdfShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const isPdfRoute = pathname === "/pdf" || pathname.startsWith("/pdf/");
  const isNote = pathname.startsWith("/pdf/note");
  const [keepPdf, setKeepPdf] = useState(isPdfRoute);

  useEffect(() => {
    if (isPdfRoute) setKeepPdf(true);
  }, [isPdfRoute]);

  // 从其他页返回时触发一次 resize，让 canvas/布局按可视区域重算
  useEffect(() => {
    if (!isPdfRoute || !keepPdf) return;
    const id = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(id);
  }, [isPdfRoute, keepPdf]);

  return (
    <>
      {keepPdf ? (
        <div
          className={
            isPdfRoute
              ? "h-dvh overflow-hidden"
              : // 不用 display:none，降低 canvas 被浏览器丢上下文的概率
                "pointer-events-none invisible fixed inset-0 z-[-1] h-dvh overflow-hidden"
          }
          aria-hidden={!isPdfRoute}
        >
          <PdfPageClient
            paused={!isPdfRoute || isNote}
            noteSlot={isNote ? children : null}
          />
        </div>
      ) : null}
      {/* /pdf 主界面由常驻阅读器负责；笔记内容只进 noteSlot */}
      {isPdfRoute ? null : children}
    </>
  );
}
