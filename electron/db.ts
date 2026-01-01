// 查询单词
export function findWordByText(db: sqlite3.Database, word: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM words WHERE word = ?', [word], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 插入单词
export function insertWord(db: sqlite3.Database, word: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO words (word) VALUES (?)', [word], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

// 插入 study_logs
export function insertStudyLog(db: sqlite3.Database, word_id: number, action_type: string, note: string | null = null): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO study_logs (word_id, action_type, note) VALUES (?, ?, ?)', [word_id, action_type, note], err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// 查询单词所有日志
export function getWordLogs(db: sqlite3.Database, word_id: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM study_logs WHERE word_id = ?', [word_id], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 查询单词所有笔记
export function getWordNotes(db: sqlite3.Database, word_id: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM notes WHERE word_id = ?', [word_id], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
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
