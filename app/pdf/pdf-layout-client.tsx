"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import PdfPageClient from "./pdf-page-client";

/** PDF 阅读器放在 layout，进出笔记页时不卸载，避免返回卡顿 */
export default function PdfLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isNote = pathname.startsWith("/pdf/note");

  return (
    <div className="relative h-dvh overflow-hidden">
      <div
        className={
          isNote
            ? "invisible pointer-events-none absolute inset-0"
            : "absolute inset-0"
        }
        aria-hidden={isNote}
      >
        <PdfPageClient />
      </div>
      {children}
    </div>
  );
}
