import { describe, expect, it } from "vitest";
import { getSelectedWord } from "./get-selected-word";

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
});
