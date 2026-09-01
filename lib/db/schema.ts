import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 最近阅读：上次打开的 PDF、页码与缩放比例 */
export const pdfRecentReads = sqliteTable("pdf_recent_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull().unique(),
  pageNumber: integer("page_number").notNull().default(1),
  /** PDF 总页数 */
  totalNumber: integer("total_number").notNull().default(0),
  scale: real("scale").notNull().default(1),
  storageKey: text("storage_key").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** PDF 选区笔记：单词 / 句子定位 + 笔记 */
export const pdfWordMarks = sqliteTable("pdf_word_marks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  word: text("word").notNull(),
  type: text("type").notNull(),
  note: text("note").notNull().default(""),
  pageNumber: integer("page_number").notNull(),
  rectLeft: real("rect_left").notNull(),
  rectTop: real("rect_top").notNull(),
  rectWidth: real("rect_width").notNull(),
  rectHeight: real("rect_height").notNull(),
  contextBefore: text("context_before").notNull().default(""),
  contextAfter: text("context_after").notNull().default(""),
  locator: text("locator").notNull(),
  /** 查询该 mark 的次数 */
  queryCount: integer("query_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** PDF 页内标记：问题 / 笔记 / 书签 / 待办（type 区分） */
export const pdfPins = sqliteTable("pdf_pins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  type: text("type").notNull(), // question | note | bookmark | todo
  pageNumber: integer("page_number").notNull(),
  rectLeft: real("rect_left").notNull(),
  rectTop: real("rect_top").notNull(),
  rectWidth: real("rect_width").notNull(),
  rectHeight: real("rect_height").notNull(),
  content: text("content").notNull().default(""),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** PDF 标注笔记：箭头 / 圆形 / 矩形等 */
export const pdfAnnotations = sqliteTable("pdf_annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  pageNumber: integer("page_number").notNull(),
  type: text("type").notNull(),
  x1: real("x1").notNull(),
  y1: real("y1").notNull(),
  x2: real("x2").notNull(),
  y2: real("y2").notNull(),
  color: text("color").notNull().default("#dc2626"),
  strokeWidth: real("stroke_width").notNull().default(2),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * 页面停留 / 学习时长：
 * 打开或重新获得焦点开始一段；离开页面 / 切站 / 失焦结束一段。
 */
export const pageDwellSessions = sqliteTable("page_dwell_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** 客户端生成的一段连续计时 ID，用于心跳 upsert */
  clientSessionId: text("client_session_id").notNull().unique(),
  pagePath: text("page_path").notNull(),
  /** 可选资源标识，如 PDF fileName */
  resourceKey: text("resource_key"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
