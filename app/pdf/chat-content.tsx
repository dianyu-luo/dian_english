"use client";

import { Markdown } from "./markdown";

type ChatContentProps = {
  content: string;
  streaming?: boolean;
};

export function ChatContent({ content, streaming }: ChatContentProps) {
  if (!content.trim()) {
    return streaming ? <span className="text-[#a8a29e]">思考中…</span> : null;
  }

  return (
    <Markdown content={content}>
      {streaming ? (
        <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[#a8a29e] align-middle" />
      ) : null}
    </Markdown>
  );
}
