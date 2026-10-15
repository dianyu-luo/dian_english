"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import PdfPageClient from "@/app/pdf/pdf-page-client";

function isPdfPath(pathname: string) {
  return pathname === "/pdf" || pathname.startsWith("/pdf/");
}

function isNotePath(pathname: string) {
  return pathname === "/note" || pathname.startsWith("/note/");
}

/**
 * 首次进入 /pdf 或 /note 后保持阅读器挂载。
 * 切到活动/设置等页面时只隐藏，避免 PDF 整页卸载再解析。
 * /note 时 paused + noteSlot。
 */
export function PersistentPdfShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const isPdfRoute = isPdfPath(pathname);
  const isNote = isNotePath(pathname);
  const showShell = isPdfRoute || isNote;
  const [keepPdf, setKeepPdf] = useState(showShell);

  useEffect(() => {
    if (showShell) setKeepPdf(true);
  }, [showShell]);

  useEffect(() => {
    if (!showShell || !keepPdf) return;
    const id = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(id);
  }, [showShell, keepPdf]);

  return (
    <>
      {keepPdf ? (
        <div
          className={
            showShell
              ? "h-dvh overflow-hidden"
              : "pointer-events-none invisible fixed inset-0 z-[-1] h-dvh overflow-hidden"
          }
          aria-hidden={!showShell}
        >
          <PdfPageClient
            paused={isNote || !isPdfRoute}
            noteSlot={isNote ? children : null}
          />
        </div>
      ) : null}
      {showShell ? null : children}
    </>
  );
}
