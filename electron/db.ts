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

// 查询单词所有笔记（包含编辑历史）
export function getWordNotes(db: sqlite3.Database, word_id: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    // 先查询所有笔记
    db.all('SELECT * FROM notes WHERE word_id = ? ORDER BY created_at DESC', [word_id], (err, notes) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!notes || notes.length === 0) {
        resolve([]);
        return;
      }
      
      // 为每个笔记查询编辑历史
      const notePromises = notes.map((note: any) => {
        return new Promise((resolveNote, rejectNote) => {
          db.all(
            'SELECT content FROM note_editlog WHERE note_id = ? ORDER BY edited_at DESC LIMIT 10',
            [note.id],
            (errLog, editlogs) => {
              if (errLog) {
                rejectNote(errLog);
              } else {
                resolveNote({
                  id: note.id,
                  note: note.content || '',
                  editlog: (editlogs || []).map((log: any) => log.content || '')
                });
              }
            }
          );
        });
      });
      
      Promise.all(notePromises)
        .then(notesWithEditlog => {
          resolve(notesWithEditlog);
        })
        .catch(reject);
    });
  });
}

// 添加笔记编辑历史记录
export function addNoteEditLog(db: sqlite3.Database, note_id: number, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO note_editlog (note_id, content) VALUES (?, ?)',
      [note_id, content],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// 创建笔记（同时创建初始编辑历史）
export function createNote(db: sqlite3.Database, word_id: number, content: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO notes (word_id, content) VALUES (?, ?)',
      [word_id, content],
      function (err) {
        if (err) {
          reject(err);
        } else {
          const noteId = this.lastID;
          // 创建初始编辑历史
          addNoteEditLog(db, noteId, content).then(() => {
            resolve(noteId);
          }).catch(reject);
        }
      }
    );
  });
}

// 更新笔记（同时记录编辑历史）
export function updateNote(db: sqlite3.Database, note_id: number, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 先更新笔记内容
    db.run(
      'UPDATE notes SET content = ? WHERE id = ?',
      [content, note_id],
      (err) => {
        if (err) {
          reject(err);
        } else {
          // 记录编辑历史
          addNoteEditLog(db, note_id, content).then(() => {
            resolve();
          }).catch(reject);
        }
      }
    );
  });
}

// 删除笔记
export function deleteNote(db: sqlite3.Database, note_id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // 先删除编辑历史
    db.run('DELETE FROM note_editlog WHERE note_id = ?', [note_id], () => {
      // 再删除笔记
      db.run('DELETE FROM notes WHERE id = ?', [note_id], (err) => {
        if (err) reject(err);
        else resolve();
      });
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
    // 确保表存在
    ensureTables(dbInstance).catch(err => {
      console.error('初始化数据库表失败:', err);
    });
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

// 确保所有必要的表存在
export function ensureTables(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    const tables = [
      // words 表
      `CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      // notes 表
      `CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(word_id) REFERENCES words(id)
      )`,
      // note_editlog 表 - 存储笔记编辑历史
      `CREATE TABLE IF NOT EXISTS note_editlog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(note_id) REFERENCES notes(id)
      )`,
      // study_logs 表
      `CREATE TABLE IF NOT EXISTS study_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER,
        action_type TEXT NOT NULL,
        note TEXT,
        studied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(word_id) REFERENCES words(id)
      )`,
    ];

    let completed = 0;
    tables.forEach(sql => {
      db.run(sql, (err) => {
        if (err) {
          console.error('创建表失败:', err);
          reject(err);
        } else {
          completed++;
          if (completed === tables.length) {
            resolve();
          }
        }
      });
    });
  });
}

export function insertLog(db: sqlite3.Database, time: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO logs (time) VALUES (?)', [time], err => (err ? reject(err) : resolve()));
  });
}
