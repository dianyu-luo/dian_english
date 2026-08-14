"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[#1c1917]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[#44403c]">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[#1c1917] underline underline-offset-2 hover:text-[#57534e]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-semibold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-sm font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[#d6d3d1] pl-3 text-[#57534e] first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[#e7e2d9]" />,
  code: ({ className, children }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return <code className="font-mono text-[12px] leading-5 text-[#292524]">{children}</code>;
    }
    return (
      <code className="rounded-sm bg-[#f0ebe3] px-1 py-0.5 font-mono text-[12px] text-[#1c1917]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto border border-[#e7e2d9] bg-[#f6f4ef] px-2.5 py-2 font-mono text-[12px] leading-5 first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-[#d6d3d1] bg-[#f6f4ef]">{children}</thead>,
  th: ({ children }) => <th className="px-2 py-1.5 font-medium text-[#1c1917]">{children}</th>,
  td: ({ children }) => (
    <td className="border-t border-[#e7e2d9] px-2 py-1.5 text-[#44403c]">{children}</td>
  ),
};

type ChatMarkdownProps = {
  content: string;
  streaming?: boolean;
};

export function ChatMarkdown({ content, streaming }: ChatMarkdownProps) {
  if (!content.trim()) {
    return streaming ? <span className="text-[#a8a29e]">思考中…</span> : null;
  }

  return (
    <div className="chat-md text-sm leading-6 text-[#292524]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      {streaming ? (
        <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[#a8a29e] align-middle" />
      ) : null}
    </div>
  );
}
