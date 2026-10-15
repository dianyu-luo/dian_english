import type { ReactNode } from "react";

/** PDF 阅读器由根布局 PersistentPdfShell 常驻挂载，此处只透传子页面（如笔记） */
export default function PdfLayout({ children }: { children: ReactNode }) {
  return children;
}
