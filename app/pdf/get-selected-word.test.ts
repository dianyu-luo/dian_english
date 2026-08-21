import { describe, expect, it } from "vitest";
import {
  getSelectedWord,
  isEnglishWord,
  mergeLineRects,
  resolveHighlightRects,
  selectionTypeFromRaw,
} from "./get-selected-word";

function mockSelection(text: string): Selection {
  return {
    isCollapsed: text.length === 0,
    rangeCount: text.length === 0 ? 0 : 1,
    toString: () => text,
  } as Selection;
}

describe("getSelectedWord", () => {
  it("提取选区中的第一个英文单词", () => {
    expect(getSelectedWord(mockSelection("hello world"))).toBe("hello");
  });

  it("中文不算单词", () => {
    expect(getSelectedWord(mockSelection("你好"))).toBeNull();
    expect(getSelectedWord(mockSelection("学习英语"))).toBeNull();
  });

  it("混合文本只提取英文", () => {
    expect(getSelectedWord(mockSelection("hello世界"))).toBe("hello");
    expect(getSelectedWord(mockSelection("世界hello"))).toBe("hello");
  });

  it("支持撇号与连字符", () => {
    expect(getSelectedWord(mockSelection("don't"))).toBe("don't");
    expect(getSelectedWord(mockSelection("well-known"))).toBe("well-known");
  });
});

describe("isEnglishWord", () => {
  it("仅英文单词为 true", () => {
    expect(isEnglishWord("hello")).toBe(true);
    expect(isEnglishWord("COVID-19")).toBe(true);
    expect(isEnglishWord("don't")).toBe(true);
    expect(isEnglishWord("你好")).toBe(false);
    expect(isEnglishWord("hello世界")).toBe(false);
    expect(isEnglishWord("123")).toBe(false);
    expect(isEnglishWord("hello world")).toBe(false);
  });
});

describe("selectionTypeFromRaw", () => {
  it("含空白为句子", () => {
    expect(selectionTypeFromRaw("hello world")).toBe("sentence");
    expect(selectionTypeFromRaw("hello")).toBe("word");
  });
});

describe("mergeLineRects", () => {
  it("同一行碎片合并成一条", () => {
    const merged = mergeLineRects([
      { left: 0.1, top: 0.2, width: 0.1, height: 0.02 },
      { left: 0.22, top: 0.205, width: 0.15, height: 0.02 },
      { left: 0.4, top: 0.2, width: 0.08, height: 0.021 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.left).toBeCloseTo(0.1);
    expect(merged[0]!.width).toBeCloseTo(0.38);
  });

  it("不同行保持多条高亮", () => {
    const merged = mergeLineRects([
      { left: 0.1, top: 0.2, width: 0.7, height: 0.02 },
      { left: 0.1, top: 0.24, width: 0.4, height: 0.02 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.top).toBeCloseTo(0.2);
    expect(merged[1]!.top).toBeCloseTo(0.24);
    expect(merged[1]!.width).toBeCloseTo(0.4);
  });
});

describe("resolveHighlightRects", () => {
  it("优先使用 locator 中的按行 rects", () => {
    const locator = JSON.stringify({
      rect: { left: 0, top: 0, width: 1, height: 0.1 },
      rects: [
        { left: 0.1, top: 0.2, width: 0.8, height: 0.02 },
        { left: 0.1, top: 0.24, width: 0.3, height: 0.02 },
      ],
    });
    const rects = resolveHighlightRects({
      locator,
      rect: { left: 0, top: 0, width: 1, height: 0.1 },
    });
    expect(rects).toHaveLength(2);
    expect(rects[1]!.width).toBeCloseTo(0.3);
  });

  it("无 rects 时退回单个包围盒", () => {
    const rects = resolveHighlightRects({
      rect: { left: 0.1, top: 0.2, width: 0.5, height: 0.08 },
    });
    expect(rects).toEqual([{ left: 0.1, top: 0.2, width: 0.5, height: 0.08 }]);
  });
});
