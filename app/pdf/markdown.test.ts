import { describe, expect, it } from "vitest";
import { prepareMarkdown } from "./markdown-prepare";

describe("prepareMarkdown", () => {
  it("把多行 $$ 公式改成开闭定界符单独成行", () => {
    const src = [
      "$$\\sum_{n\\text{奇}}\\frac{\\chi_4(n)}",
      "{n}",
      "=1-\\frac13+\\frac15-\\frac17+\\cdots",
      "=\\frac{\\pi}{4}.$$",
    ].join("\n");

    const out = prepareMarkdown(src);
    expect(out).toContain("$$\n\\sum_{n\\text{奇}}\\frac{\\chi_4(n)}\n");
    expect(out.trim().startsWith("$$")).toBe(true);
    expect(out.trim().endsWith("$$")).toBe(true);
    expect(out).not.toContain(".$$");
  });

  it("单行 $$ 公式保持原样", () => {
    expect(prepareMarkdown("见 $$a+b$$ 即可")).toBe("见 $$a+b$$ 即可");
  });
});
