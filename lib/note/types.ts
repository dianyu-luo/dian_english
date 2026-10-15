export type NoteSaveKind =
  | "word"
  | "question"
  | "note"
  | "bookmark"
  | "todo"
  | "review"
  | "intensive";

export const NOTE_SAVE_KINDS: readonly NoteSaveKind[] = [
  "word",
  "question",
  "note",
  "bookmark",
  "todo",
  "review",
  "intensive",
] as const;

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
