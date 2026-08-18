"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import PdfPageClient from "./pdf-page-client";

/** PDF 阅读器与对话栏放在 layout，进出笔记页时不卸载 */
export default function PdfLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isNote = pathname.startsWith("/pdf/note");

  return (
    <div className="h-dvh overflow-hidden">
      <PdfPageClient paused={isNote} noteSlot={isNote ? children : null} />
    </div>
  );
}
