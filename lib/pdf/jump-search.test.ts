import { describe, expect, it } from "vitest";
import { buildPdfHref, parsePdfJumpSearch } from "./jump-search";

describe("buildPdfHref / parsePdfJumpSearch", () => {
  it("单词跳转参数可往返", () => {
    const href = buildPdfHref({
      fileName: "a.pdf",
      pageNumber: 3,
      word: "lemma",
      rects: [{ left: 0.12, top: 0.34, width: 0.08, height: 0.02 }],
    });
    expect(href.startsWith("/pdf?")).toBe(true);

    const jump = parsePdfJumpSearch(href.slice("/pdf".length));
    expect(jump).toEqual({
      fileName: "a.pdf",
      pageNumber: 3,
      word: "lemma",
      rects: [{ left: 0.12, top: 0.34, width: 0.08, height: 0.02 }],
    });
  });

  it("无高亮时只带文件名", () => {
    expect(buildPdfHref({ fileName: "b.pdf" })).toBe("/pdf?fileName=b.pdf");
    expect(parsePdfJumpSearch("fileName=b.pdf")).toEqual({
      fileName: "b.pdf",
      pageNumber: null,
      word: null,
      rects: [],
    });
  });

  it("忽略无效矩形", () => {
    const jump = parsePdfJumpSearch("fileName=a.pdf&page=2&word=x&hl=1,2,0,3|0.1,0.2,0.3,0.04");
    expect(jump.rects).toEqual([{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }]);
  });
});
