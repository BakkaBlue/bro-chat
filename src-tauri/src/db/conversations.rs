use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{Conversation, ConversationSummary};

use super::{characters, messages};

pub fn list_by_character(
    conn: &Connection,
    character_id: &str,
) -> AppResult<Vec<ConversationSummary>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.character_id, c.title, c.created_at, c.updated_at, COUNT(m.id)
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.character_id = ?1
         GROUP BY c.id
         ORDER BY c.updated_at DESC",
    )?;
    let rows = stmt.query_map(params![character_id], |r| {
        Ok(ConversationSummary {
            id: r.get(0)?,
            character_id: r.get(1)?,
            title: r.get(2)?,
            created_at: r.get(3)?,
            updated_at: r.get(4)?,
            message_count: r.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// 创建对话。有开场白时按下标取一条（None = 第一条）作为 assistant 开场消息。
pub fn create(
    conn: &Connection,
    character_id: &str,
    greeting_index: Option<usize>,
) -> AppResult<Conversation> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO conversations (id, character_id, title, created_at, updated_at)
         VALUES (?1, ?2, '新对话', ?3, ?3)",
        params![id, character_id, now],
    )?;
    if let Some(character) = characters::get(conn, character_id)? {
        let idx = greeting_index
            .filter(|i| *i < character.first_messages.len())
            .unwrap_or(0);
        let first = character.first_messages.into_iter().nth(idx);
        if let Some(greeting) = first.filter(|s| !s.trim().is_empty()) {
            messages::insert(conn, &id, "assistant", &greeting)?;
        }
    }
    Ok(Conversation {
        id,
        character_id: character_id.to_string(),
        title: "新对话".into(),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<Conversation>> {
    conn.query_row(
        "SELECT id, character_id, title, created_at, updated_at
         FROM conversations WHERE id = ?1",
        params![id],
        |r| {
            Ok(Conversation {
                id: r.get(0)?,
                character_id: r.get(1)?,
                title: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub fn get_required(conn: &Connection, id: &str) -> AppResult<Conversation> {
    get(conn, id)?.ok_or_else(|| AppError::other(format!("对话不存在: {id}")))
}

pub fn rename(conn: &Connection, id: &str, title: &str) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )?;
    if n == 0 {
        return Err(AppError::other(format!("对话不存在: {id}")));
    }
    Ok(())
}

/// 自动标题：只在仍是默认「新对话」时改名（发送第一条用户消息后调用）
pub fn rename_if_untitled(conn: &Connection, id: &str, title: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2
         WHERE id = ?3 AND title = '新对话'",
        params![title, Utc::now().to_rfc3339(), id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    Ok(())
}
