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

function mapOutsideCodeFences(src: string, fn: (chunk: string) => string) {
  return src
    .split(/(```[\s\S]*?```)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/** 多行 $$...$$ 必须把开闭定界符单独成行，remark-math 才按块公式解析 */
function normalizeMultilineDisplayMath(src: string) {
  return mapOutsideCodeFences(src, (chunk) =>
    chunk.replace(/\$\$([\s\S]*?)\$\$/g, (full, body: string) => {
      if (!body.includes("\n")) return full;
      const tex = body.replace(/^\n+|\n+$/g, "").trim();
      if (!tex) return full;
      return `\n$$\n${tex}\n$$\n`;
    }),
  );
}

export function prepareMarkdown(src: string) {
  return normalizeMultilineDisplayMath(normalizeLatexDelimiters(unwrapMathFromCode(src)));
}
