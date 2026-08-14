import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const testFiles = sqliteTable("test_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const helloTest = sqliteTable("hello_test", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** 最近阅读：上次打开的 PDF 与页码 */
export const pdfRecentReads = sqliteTable("pdf_recent_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull().unique(),
  pageNumber: integer("page_number").notNull().default(1),
  storageKey: text("storage_key").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** PDF 选中单词的定位记录，便于下次找回 */
export const pdfWordMarks = sqliteTable("pdf_word_marks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  word: text("word").notNull(),
  raw: text("raw").notNull(),
  pageNumber: integer("page_number").notNull(),
  rectLeft: real("rect_left").notNull(),
  rectTop: real("rect_top").notNull(),
  rectWidth: real("rect_width").notNull(),
  rectHeight: real("rect_height").notNull(),
  contextBefore: text("context_before").notNull().default(""),
  contextAfter: text("context_after").notNull().default(""),
  locator: text("locator").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** PDF 问题标记：问号位置 + 问题内容 */
export const pdfQuestions = sqliteTable("pdf_questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  pageNumber: integer("page_number").notNull(),
  rectLeft: real("rect_left").notNull(),
  rectTop: real("rect_top").notNull(),
  rectWidth: real("rect_width").notNull(),
  rectHeight: real("rect_height").notNull(),
  content: text("content").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
