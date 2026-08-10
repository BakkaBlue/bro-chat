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

const MIGRATION_2: &str = "
CREATE TABLE IF NOT EXISTS lorebooks (
  id                TEXT PRIMARY KEY,
  character_id      TEXT NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  scan_depth        INTEGER NOT NULL DEFAULT 4,
  token_budget      INTEGER NOT NULL DEFAULT 500,
  recursive_scanning INTEGER NOT NULL DEFAULT 0,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lore_entries (
  id               TEXT PRIMARY KEY,
  lorebook_id      TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
  keys             TEXT NOT NULL DEFAULT '[]',
  secondary_keys   TEXT NOT NULL DEFAULT '[]',
  comment          TEXT NOT NULL DEFAULT '',
  content          TEXT NOT NULL DEFAULT '',
  constant         INTEGER NOT NULL DEFAULT 0,
  selective        INTEGER NOT NULL DEFAULT 0,
  insertion_order  INTEGER NOT NULL DEFAULT 0,
  enabled          INTEGER NOT NULL DEFAULT 1,
  position         TEXT NOT NULL DEFAULT 'before_char',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lore_entries_book ON lore_entries(lorebook_id);
";

const MIGRATION_3: &str = "
-- 拖拽排序：角色与对话加 sort_order，初始按插入顺序
ALTER TABLE characters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE characters SET sort_order = rowid;
UPDATE conversations SET sort_order = rowid;
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
    if version < 2 {
        let tx = conn.transaction()?;
        tx.execute_batch(MIGRATION_2)?;
        tx.pragma_update(None, "user_version", 2)?;
        tx.commit()?;
    }
    if version < 3 {
        let tx = conn.transaction()?;
        tx.execute_batch(MIGRATION_3)?;
        tx.pragma_update(None, "user_version", 3)?;
        tx.commit()?;
    }
    Ok(())
}
