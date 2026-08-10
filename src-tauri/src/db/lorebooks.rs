//! 世界书（lorebook）数据层：一个角色一本（character_id 唯一），整书替换式保存。

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{Lorebook, LoreEntry, LorebookInput};

fn parse_json_string_array(s: String) -> Vec<String> {
    serde_json::from_str(&s).unwrap_or_default()
}

fn entry_from_row(r: &rusqlite::Row) -> rusqlite::Result<LoreEntry> {
    Ok(LoreEntry {
        id: r.get(0)?,
        keys: parse_json_string_array(r.get(1)?),
        secondary_keys: parse_json_string_array(r.get(2)?),
        comment: r.get(3)?,
        content: r.get(4)?,
        constant: r.get::<_, i64>(5)? != 0,
        selective: r.get::<_, i64>(6)? != 0,
        insertion_order: r.get(7)?,
        enabled: r.get::<_, i64>(8)? != 0,
        position: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

pub fn get_by_character(conn: &Connection, character_id: &str) -> AppResult<Option<Lorebook>> {
    let book = conn
        .query_row(
            "SELECT id, character_id, name, description, scan_depth, token_budget,
                    recursive_scanning, enabled, created_at, updated_at
             FROM lorebooks WHERE character_id = ?1",
            params![character_id],
            |r| {
                Ok(Lorebook {
                    id: r.get(0)?,
                    character_id: r.get(1)?,
                    name: r.get(2)?,
                    description: r.get(3)?,
                    scan_depth: r.get(4)?,
                    token_budget: r.get(5)?,
                    recursive_scanning: r.get::<_, i64>(6)? != 0,
                    enabled: r.get::<_, i64>(7)? != 0,
                    entries: Vec::new(), // 下面补
                    created_at: r.get(8)?,
                    updated_at: r.get(9)?,
                })
            },
        )
        .optional()?;
    let mut book = match book {
        Some(b) => b,
        None => return Ok(None),
    };
    let mut stmt = conn.prepare(
        "SELECT id, keys, secondary_keys, comment, content, constant, selective,
                insertion_order, enabled, position, created_at, updated_at
         FROM lore_entries WHERE lorebook_id = ?1 ORDER BY insertion_order ASC",
    )?;
    let rows = stmt.query_map(params![book.id], entry_from_row)?;
    for row in rows {
        book.entries.push(row?);
    }
    Ok(Some(book))
}

/// 整书替换保存：更新书籍字段 + 重建条目。不存在则创建。
pub fn save(conn: &Connection, character_id: &str, input: &LorebookInput) -> AppResult<Lorebook> {
    let now = Utc::now().to_rfc3339();
    let existing = get_by_character(conn, character_id)?;

    let book_id = match existing {
        Some(b) => {
            conn.execute(
                "UPDATE lorebooks SET name=?1, description=?2, scan_depth=?3, token_budget=?4,
                        recursive_scanning=?5, enabled=?6, updated_at=?7
                 WHERE id=?8",
                params![
                    input.name,
                    input.description,
                    input.scan_depth,
                    input.token_budget,
                    input.recursive_scanning as i64,
                    input.enabled as i64,
                    now,
                    b.id
                ],
            )?;
            b.id
        }
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO lorebooks (id, character_id, name, description, scan_depth,
                        token_budget, recursive_scanning, enabled, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                params![
                    id,
                    character_id,
                    input.name,
                    input.description,
                    input.scan_depth,
                    input.token_budget,
                    input.recursive_scanning as i64,
                    input.enabled as i64,
                    now
                ],
            )?;
            id
        }
    };

    // 重建条目
    conn.execute(
        "DELETE FROM lore_entries WHERE lorebook_id = ?1",
        params![book_id],
    )?;
    for e in &input.entries {
        conn.execute(
            "INSERT INTO lore_entries (id, lorebook_id, keys, secondary_keys, comment,
                    content, constant, selective, insertion_order, enabled, position,
                    created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",
            params![
                Uuid::new_v4().to_string(),
                book_id,
                serde_json::to_string(&e.keys)?,
                serde_json::to_string(&e.secondary_keys)?,
                e.comment,
                e.content,
                e.constant as i64,
                e.selective as i64,
                e.insertion_order,
                e.enabled as i64,
                e.position,
                now
            ],
        )?;
    }

    get_by_character(conn, character_id)?.ok_or_else(|| AppError::other("世界书保存后读取失败"))
}

pub fn delete_by_character(conn: &Connection, character_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM lorebooks WHERE character_id = ?1",
        params![character_id],
    )?;
    Ok(())
}
