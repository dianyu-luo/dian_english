import "server-only";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "fs";
import path from "path";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.db");

const globalForDb = globalThis as unknown as {
  sqliteClient?: ReturnType<typeof createClient>;
};

function createSqliteClient() {
  return createClient({
    url: `file:${dbPath}`,
  });
}

const client = globalForDb.sqliteClient ?? createSqliteClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.sqliteClient = client;
}

export const db = drizzle(client, { schema });
