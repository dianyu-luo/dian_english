import type { NoteSaveKind } from "./types";

export type BuildNoteHrefOptions = {
  kind?: NoteSaveKind;
  id?: number;
  word?: string;
  body?: string;
};

/** 统一笔记页入口：/pdf/note?... */
export function buildNoteHref(opts: BuildNoteHrefOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.id != null && opts.id >= 1) params.set("id", String(opts.id));
  const title = opts.word?.trim();
  if (title) params.set("word", title);
  if (opts.body) params.set("body", opts.body);
  const qs = params.toString();
  return qs ? `/pdf/note?${qs}` : "/pdf/note";
}
