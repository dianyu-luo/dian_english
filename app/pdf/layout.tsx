import type { ReactNode } from "react";
import PdfLayoutClient from "./pdf-layout-client";

export default function PdfLayout({ children }: { children: ReactNode }) {
  return <PdfLayoutClient>{children}</PdfLayoutClient>;
}
