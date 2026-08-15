"use client";

import katex from "katex";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Components } from "react-markdown";
// KaTeX CSS 在 globals.css 中统一引入

function MathFormula({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  const [copied, setCopied] = useState(false);

  let html = "";
  try {
    html = katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return <code className="font-mono text-[12px]">{tex}</code>;
  }

  const copyLatex = async () => {
    const payload = displayMode ? `$$${tex}$$` : `$${tex}$`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <span
      className={`group/math relative ${
        displayMode ? "katex-display-wrap my-2 block" : "katex-inline-wrap inline-block max-w-full align-middle"
      }`}
    >
      <span
        className={displayMode ? "block overflow-x-auto overflow-y-hidden" : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void copyLatex();
        }}
        title="复制 LaTeX"
        aria-label="复制 LaTeX"
        className="absolute top-0 right-0 z-10 border border-[#d6d3d1] bg-white/95 px-1.5 py-0.5 text-[10px] leading-none text-[#57534e] shadow-sm opacity-0 transition-opacity group-hover/math:opacity-100 hover:bg-[#f6f4ef] hover:text-[#1c1917] focus-visible:opacity-100"
      >
        {copied ? "已复制" : "复制"}
      </button>
    </span>
  );
}

function extractText(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (typeof children === "object" && children && "props" in children) {
    return extractText((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function isMathClass(cls: string) {
  return (
    cls.includes("math-inline") ||
    cls.includes("math-display") ||
    /(?:^|\s)language-(?:math|latex|tex|katex)(?:\s|$)/.test(cls)
  );
}

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
    const text = extractText(children).replace(/\n$/, "");
    const cls = className ?? "";

    if (isMathClass(cls)) {
      const display =
        cls.includes("math-display") || /language-(?:latex|tex|katex)(?:\s|$)/.test(cls);
      return <MathFormula tex={text} displayMode={display} />;
    }

    const dollar = text.match(/^\$\$([\s\S]+)\$\$$/) ?? text.match(/^\$([^$]+)\$$/);
    if (dollar) {
      return <MathFormula tex={dollar[1].trim()} displayMode={text.startsWith("$$")} />;
    }

    const isBlock = cls.includes("language-");
    if (isBlock) {
      return <code className="font-mono text-[12px] leading-5 text-[#292524]">{children}</code>;
    }
    return (
      <code className="rounded-sm bg-[#f0ebe3] px-1 py-0.5 font-mono text-[12px] text-[#1c1917]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => {
    const text = extractText(children).replace(/\n$/, "").trim();
    const dollar = text.match(/^\$\$([\s\S]+)\$\$$/) ?? text.match(/^\$([^$]+)\$$/);
    if (dollar) {
      return <MathFormula tex={dollar[1].trim()} displayMode />;
    }

    const childList = Array.isArray(children) ? children : [children];
    const mathChild = childList.find(
      (c) =>
        typeof c === "object" &&
        c &&
        "props" in c &&
        typeof (c as { props?: { className?: string } }).props?.className === "string" &&
        isMathClass((c as { props: { className: string } }).props.className),
    );
    if (mathChild) return <>{children}</>;

    return (
      <pre className="my-2 overflow-x-auto border border-[#e7e2d9] bg-[#f6f4ef] px-2.5 py-2 font-mono text-[12px] leading-5 first:mt-0 last:mb-0">
        {children}
      </pre>
    );
  },
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

/** 模型常把公式塞进代码块；拆出来交给 math 插件 */
function unwrapMathFromCode(src: string) {
  let out = src;

  out = out.replace(/`(\$\$[^`]+\$\$|\$[^`$]+\$)`/g, "$1");
  out = out.replace(/(^|\n)(?: {4}|\t)(\$\$[^$\n]+\$\$|\$[^$\n]+\$)[ \t]*(?=\n|$)/g, "$1\n$2\n");

  out = out.replace(/```(?:latex|tex|math|katex)?\s*\n?([\s\S]*?)```/gi, (full, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return full;

    if (/^\$\$[\s\S]*\$\$$/.test(trimmed)) {
      return `\n${trimmed}\n`;
    }
    if (/^\$[^$]+\$/.test(trimmed) && trimmed.indexOf("$", 1) === trimmed.length - 1) {
      return `\n$$\n${trimmed.slice(1, -1).trim()}\n$$\n`;
    }
    if (/^\\\[[\s\S]*\\\]$/.test(trimmed) || /^\\\([\s\S]*\\\)$/.test(trimmed)) {
      return `\n${trimmed}\n`;
    }
    if (/\\[a-zA-Z]+|\^|_\{/.test(trimmed) && !trimmed.includes("```")) {
      return `\n$$\n${trimmed}\n$$\n`;
    }
    return full;
  });

  return out;
}

function normalizeLatexDelimiters(src: string) {
  return src
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);
}

function prepareMarkdown(src: string) {
  return normalizeLatexDelimiters(unwrapMathFromCode(src));
}

type ChatMarkdownProps = {
  content: string;
  streaming?: boolean;
};

export function ChatMarkdown({ content, streaming }: ChatMarkdownProps) {
  if (!content.trim()) {
    return streaming ? <span className="text-[#a8a29e]">思考中…</span> : null;
  }

  const markdown = prepareMarkdown(content);

  return (
    <div className="chat-md text-sm text-[#292524]">
      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
      {streaming ? (
        <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[#a8a29e] align-middle" />
      ) : null}
    </div>
  );
}
