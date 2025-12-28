-- Active: 1766932702223@@127.0.0.1@3306

-- 词汇学习数据库 SQLite 建表语句



CREATE TABLE word_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE word_feature_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  feature_id INTEGER NOT NULL,
  note TEXT,
  FOREIGN KEY(word_id) REFERENCES words(id),
  FOREIGN KEY(feature_id) REFERENCES word_features(id)
);

CREATE TABLE grammar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER,
  feature_id INTEGER,
  grammar_id INTEGER,
  action_type TEXT NOT NULL,
  studied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  FOREIGN KEY(word_id) REFERENCES words(id),
  FOREIGN KEY(feature_id) REFERENCES word_features(id),
  FOREIGN KEY(grammar_id) REFERENCES grammar(id)
);

CREATE TABLE word_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id_from INTEGER NOT NULL,
  word_id_to INTEGER NOT NULL,
  relation_type TEXT,
  description TEXT,
  FOREIGN KEY(word_id_from) REFERENCES words(id),
  FOREIGN KEY(word_id_to) REFERENCES words(id)
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER,
  feature_id INTEGER,
  grammar_id INTEGER,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(word_id) REFERENCES words(id),
  FOREIGN KEY(feature_id) REFERENCES word_features(id),
  FOREIGN KEY(grammar_id) REFERENCES grammar(id)
);

CREATE TABLE note_feature_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  feature_id INTEGER NOT NULL,
  note TEXT,
  FOREIGN KEY(note_id) REFERENCES notes(id),
  FOREIGN KEY(feature_id) REFERENCES word_features(id)
);

CREATE TABLE note_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id_from INTEGER NOT NULL,
  note_id_to INTEGER NOT NULL,
  relation_type TEXT,
  description TEXT,
  FOREIGN KEY(note_id_from) REFERENCES notes(id),
  FOREIGN KEY(note_id_to) REFERENCES notes(id)
);
