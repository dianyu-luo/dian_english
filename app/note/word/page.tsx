import { redirect } from "next/navigation";

/** 兼容旧路径，统一到 /pdf/note 以复用 PDF layout 保活 */
export default async function NoteWordRedirect({
  searchParams,
}: {
  searchParams: Promise<{ word?: string }>;
}) {
  const { word } = await searchParams;
  const qs = word ? `?word=${encodeURIComponent(word)}` : "";
  redirect(`/pdf/note${qs}`);
}
