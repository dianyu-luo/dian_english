"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import PdfPageClient from "@/app/pdf/pdf-page-client";

/**
 * 首次进入 /pdf 后保持阅读器挂载。
 * 切到活动/设置等页面时只隐藏，避免 PDF 整页卸载再解析。
 * /pdf/note 时 paused + noteSlot。
 */
export function PersistentPdfShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const isPdfRoute = pathname === "/pdf" || pathname.startsWith("/pdf/");
  const isNote = pathname.startsWith("/pdf/note");
  const [keepPdf, setKeepPdf] = useState(isPdfRoute);

  useEffect(() => {
    if (isPdfRoute) setKeepPdf(true);
  }, [isPdfRoute]);

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
              : "pointer-events-none invisible fixed inset-0 z-[-1] h-dvh overflow-hidden"
          }
          aria-hidden={!isPdfRoute}
        >
          <PdfPageClient
            paused={isNote || !isPdfRoute}
            noteSlot={isNote ? children : null}
          />
        </div>
      ) : null}
      {isPdfRoute ? null : children}
    </>
  );
}
