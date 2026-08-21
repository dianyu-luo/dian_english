import { describe, expect, it } from "vitest";
import { getSelectedWord, isEnglishWord } from "./get-selected-word";

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
