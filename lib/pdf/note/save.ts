import { PIN_KINDS, type PinKind } from "./kinds";

/** 笔记页可回写的目标：划词笔记或页内标记 */
export type NoteSaveKind = "word" | PinKind;

export const NOTE_SAVE_KINDS: readonly NoteSaveKind[] = ["word", ...PIN_KINDS];

const SAVE_KIND_SET = new Set<string>(NOTE_SAVE_KINDS);

export function isNoteSaveKind(value: string): value is NoteSaveKind {
  return SAVE_KIND_SET.has(value);
}

export type NoteSaveTarget = {
  kind: NoteSaveKind;
  id: number;
};

export function parseNoteSaveTarget(
  searchParams: URLSearchParams,
): NoteSaveTarget | null {
  const kind = searchParams.get("kind");
  const id = Number(searchParams.get("id"));
  if (!kind || !isNoteSaveKind(kind) || !Number.isFinite(id) || id < 1) {
    return null;
  }
  return { kind, id };
}
