import { describe, expect, it } from "vitest";
import {
  annotationTypeLabel,
  fromAnnotation,
  fromPin,
  fromWordMark,
  mergeRecentEdits,
  pinTypeLabel,
  previewText,
  wordMarkTypeLabel,
} from "./recent-edit";

describe("previewText", () => {
  it("去掉 markdown 标题并截断", () => {
    expect(previewText("# 标题\n后面的内容再写长一点凑够截断", 8)).toBe("标题 后面的内容…");
  });

  it("空内容返回空串", () => {
    expect(previewText("   \n  ")).toBe("");
  });
});

describe("type labels", () => {
  it("映射笔记 / 标记 / 批注的子类型", () => {
    expect(wordMarkTypeLabel("sentence")).toBe("句子");
    expect(wordMarkTypeLabel("word")).toBe("单词");
    expect(pinTypeLabel("question")).toBe("问题");
    expect(pinTypeLabel("bookmark")).toBe("书签");
    expect(pinTypeLabel("todo")).toBe("待办");
    expect(pinTypeLabel("note")).toBe("笔记");
    expect(annotationTypeLabel("circle")).toBe("圆形");
    expect(annotationTypeLabel("rect")).toBe("矩形");
    expect(annotationTypeLabel("arrow")).toBe("箭头");
  });
});

describe("mergeRecentEdits", () => {
  it("按 updatedAt 倒序合并三类记录", () => {
    const items = mergeRecentEdits(
      [
        {
          id: 1,
          fileName: "a.pdf",
          word: "lemma",
          type: "word",
          note: "引理",
          pageNumber: 2,
          updatedAt: new Date("2026-08-21T10:00:00Z"),
        },
      ],
      [
        {
          id: 9,
          fileName: "b.pdf",
          type: "todo",
          content: "回头再看",
          pageNumber: 5,
          updatedAt: new Date("2026-08-21T12:00:00Z"),
        },
      ],
      [
        {
          id: 3,
          fileName: "a.pdf",
          type: "arrow",
          pageNumber: 8,
          updatedAt: new Date("2026-08-21T11:00:00Z"),
        },
      ],
      20,
    );

    expect(items.map((item) => item.key)).toEqual(["mark-9", "annotation-3", "note-1"]);
    expect(items[0]).toMatchObject({
      kindLabel: "标记",
      typeLabel: "待办",
      title: "回头再看",
      href: "/pdf?fileName=b.pdf",
    });
  });

  it("忽略已删除的标记，空内容回退到类型名", () => {
    const items = mergeRecentEdits(
      [
        {
          id: 2,
          fileName: "c.pdf",
          word: "  ",
          type: "sentence",
          note: "",
          pageNumber: 1,
          updatedAt: new Date("2026-08-21T09:00:00Z"),
        },
      ],
      [
        {
          id: 1,
          fileName: "c.pdf",
          type: "question",
          content: "",
          pageNumber: 3,
          deletedAt: new Date("2026-08-21T09:30:00Z"),
          updatedAt: new Date("2026-08-21T09:30:00Z"),
        },
      ],
      [],
      10,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "note-2",
      title: "句子",
      typeLabel: "句子",
    });
  });

  it("笔记有正文时用正文作标题", () => {
    const item = fromWordMark({
      id: 4,
      fileName: "d.pdf",
      word: "kernel",
      type: "word",
      note: "核函数",
      pageNumber: 4,
      updatedAt: "2026-08-21T08:00:00Z",
    });
    expect(item.title).toBe("核函数");
    expect(item.kindLabel).toBe("笔记");
  });

  it("标记无正文时用类型名，批注用图形名", () => {
    expect(
      fromPin({
        id: 5,
        fileName: "e.pdf",
        type: "bookmark",
        content: "",
        pageNumber: 1,
        updatedAt: 1,
      })?.title,
    ).toBe("书签");
    expect(
      fromAnnotation({
        id: 6,
        fileName: "e.pdf",
        type: "circle",
        pageNumber: 2,
        updatedAt: 1,
      }).title,
    ).toBe("圆形");
  });
});
