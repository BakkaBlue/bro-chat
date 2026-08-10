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

/// 创建对话。若角色有开场白，第一条自动作为 assistant 消息插入。
pub fn create(conn: &Connection, character_id: &str) -> AppResult<Conversation> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO conversations (id, character_id, title, created_at, updated_at)
         VALUES (?1, ?2, '新对话', ?3, ?3)",
        params![id, character_id, now],
    )?;
    let first = characters::get(conn, character_id)?
        .and_then(|c| c.first_messages.into_iter().next())
        .filter(|s| !s.trim().is_empty());
    if let Some(greeting) = first {
        messages::insert(conn, &id, "assistant", &greeting)?;
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

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    Ok(())
}
