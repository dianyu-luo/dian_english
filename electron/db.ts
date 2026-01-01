import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import { app } from 'electron';

let dbInstance: sqlite3.Database | null = null;

function getDbPath() {
  return path.join(app.getPath('userData'), 'testdb.sqlite');
}

export function openDb(): sqlite3.Database {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(getDbPath());
  }
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function ensureLogsTable(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT)',
      err => (err ? reject(err) : resolve())
    );
  });
}

export function insertLog(db: sqlite3.Database, time: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO logs (time) VALUES (?)', [time], err => (err ? reject(err) : resolve()));
  });
}
