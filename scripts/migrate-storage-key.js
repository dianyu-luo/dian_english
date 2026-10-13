const { createHash } = require("crypto");
const { createClient } = require("@libsql/client");
const { access, readFile, rename, unlink } = require("fs/promises");
const path = require("path");

const pdfDir = path.join(process.cwd(), "data", "pdfs");

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function storageKeyFromBuffer(buffer) {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  return `${hash}.pdf`;
}

async function main() {
  const client = createClient({ url: "file:./data/app.db" });
  const { rows } = await client.execute(
    "SELECT id, file_name, storage_key FROM pdf_recent_reads",
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const oldKey = String(row.storage_key);
    const oldPath = path.join(pdfDir, oldKey);

    if (!(await fileExists(oldPath))) {
      console.warn("missing file, skip:", row.file_name, oldKey);
      skipped += 1;
      continue;
    }

    const buffer = await readFile(oldPath);
    const newKey = storageKeyFromBuffer(buffer);

    if (oldKey === newKey) {
      skipped += 1;
      continue;
    }

    const newPath = path.join(pdfDir, newKey);
    if (!(await fileExists(newPath))) {
      await rename(oldPath, newPath);
    } else if (oldPath !== newPath) {
      await unlink(oldPath).catch(() => {});
    }

    await client.execute({
      sql: "UPDATE pdf_recent_reads SET storage_key = ? WHERE id = ?",
      args: [newKey, row.id],
    });

    console.log(`${row.file_name}: ${oldKey} -> ${newKey}`);
    updated += 1;
  }

  console.log(`done. updated=${updated} skipped=${skipped}`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
