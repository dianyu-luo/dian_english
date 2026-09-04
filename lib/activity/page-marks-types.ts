/** 单页上的笔记 / 标注数量（用于热力图角标） */
export type PageMarkCounts = {
  /** 选区笔记、页内笔记 */
  notes: number;
  /** 批注、问题 / 书签 / 待办等标记 */
  annotations: number;
};

export type PageMarksMap = Record<number, PageMarkCounts>;
