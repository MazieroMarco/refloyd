const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    avatar_image TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover_image TEXT,
    rehearsal_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS setlist_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setlist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (setlist_id) REFERENCES setlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    UNIQUE (setlist_id, position)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comment_mentions (
    comment_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    is_done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (comment_id, member_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  );
`);

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

if (!hasColumn('comments', 'author_id')) {
  db.exec('ALTER TABLE comments ADD COLUMN author_id INTEGER REFERENCES members(id) ON DELETE SET NULL');
}

if (!hasColumn('members', 'avatar_image')) {
  db.exec('ALTER TABLE members ADD COLUMN avatar_image TEXT');
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
  CREATE INDEX IF NOT EXISTS idx_comment_mentions_member_done ON comment_mentions(member_id, is_done);
  CREATE INDEX IF NOT EXISTS idx_setlist_songs_setlist_position ON setlist_songs(setlist_id, position);
  CREATE INDEX IF NOT EXISTS idx_setlist_songs_song_id ON setlist_songs(song_id);
`);

// Seed default members if table is empty
const memberCount = db.prepare('SELECT COUNT(*) as count FROM members').get();
if (memberCount.count === 0) {
  const insertMember = db.prepare('INSERT INTO members (name) VALUES (?)');
  const defaultMembers = ['Member 1', 'Member 2', 'Member 3', 'Member 4'];
  for (const name of defaultMembers) {
    insertMember.run(name);
  }
}

module.exports = db;
