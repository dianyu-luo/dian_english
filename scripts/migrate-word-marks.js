const { createClient } = require("@libsql/client");

async function main() {
  const client = createClient({ url: "file:./data/app.db" });
  await client.execute("PRAGMA foreign_keys=OFF");

  const info = await client.execute("PRAGMA table_info(pdf_word_marks)");
  const cols = new Set(info.rows.map((r) => String(r.name)));
  if (cols.has("type") && cols.has("note") && !cols.has("raw")) {
    console.log("already migrated:", [...cols].join(","));
    await client.close();
    return;
  }

  await client.execute(`
    CREATE TABLE pdf_word_marks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      file_name TEXT NOT NULL,
      word TEXT NOT NULL,
      type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      page_number INTEGER NOT NULL,
      rect_left REAL NOT NULL,
      rect_top REAL NOT NULL,
      rect_width REAL NOT NULL,
      rect_height REAL NOT NULL,
      context_before TEXT NOT NULL DEFAULT '',
      context_after TEXT NOT NULL DEFAULT '',
      locator TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  if (cols.has("raw")) {
    await client.execute(`
      INSERT INTO pdf_word_marks_new (
        id, file_name, word, type, note, page_number,
        rect_left, rect_top, rect_width, rect_height,
        context_before, context_after, locator, created_at, updated_at
      )
      SELECT
        id, file_name, word,
        CASE WHEN instr(trim(raw), ' ') > 0 THEN 'sentence' ELSE 'word' END,
        '',
        page_number, rect_left, rect_top, rect_width, rect_height,
        context_before, context_after, locator, created_at, updated_at
      FROM pdf_word_marks
    `);
  }

  await client.execute("DROP TABLE pdf_word_marks");
  await client.execute("ALTER TABLE pdf_word_marks_new RENAME TO pdf_word_marks");

  const after = await client.execute("PRAGMA table_info(pdf_word_marks)");
  console.log("migrated:", after.rows.map((r) => r.name).join(","));
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
