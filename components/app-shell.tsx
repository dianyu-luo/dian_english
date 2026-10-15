"use client";

import type { ReactNode } from "react";
import { PersistentPdfShell } from "./persistent-pdf-shell";
import { SyncOnUnload } from "./sync-on-unload";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SyncOnUnload />
      <PersistentPdfShell>{children}</PersistentPdfShell>
    </>
  );
}
