use rusqlite::Connection;

const MIGRATION_1: &str = "
CREATE TABLE IF NOT EXISTS characters (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  personality      TEXT NOT NULL DEFAULT '',
  scenario         TEXT NOT NULL DEFAULT '',
  first_messages   TEXT NOT NULL DEFAULT '[]',
  example_messages TEXT NOT NULL DEFAULT '',
  system_prompt    TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  nsfw             INTEGER NOT NULL DEFAULT 0,
  avatar           BLOB,
  extensions       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '新对话',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_character ON conversations(character_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, seq);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// 版本化迁移：PRAGMA user_version 控制，每个版本在事务内应用。
pub fn migrate(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        let tx = conn.transaction()?;
        tx.execute_batch(MIGRATION_1)?;
        tx.pragma_update(None, "user_version", 1)?;
        tx.commit()?;
    }
    Ok(())
}
