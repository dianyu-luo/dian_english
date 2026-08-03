import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const testFiles = sqliteTable("test_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
