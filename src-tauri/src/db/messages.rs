use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::error::AppResult;
use crate::models::Message;

/// 插入消息：seq = 当前对话 MAX(seq)+1，并顺带更新对话的 updated_at（用于列表排序）。
pub fn insert(
    conn: &Connection,
    conversation_id: &str,
    role: &str,
    content: &str,
) -> AppResult<Message> {
    let seq: i64 = conn.query_row(
        "SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
        |r| r.get(0),
    )?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, seq, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, conversation_id, role, content, seq, now],
    )?;
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![now, conversation_id],
    )?;
    Ok(Message {
        id,
        conversation_id: conversation_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        seq,
        created_at: now,
    })
}

/// 按 seq 升序取对话消息，上限 500 条（分页为 v2）。
pub fn list(conn: &Connection, conversation_id: &str) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, seq, created_at
         FROM messages WHERE conversation_id = ?1 ORDER BY seq ASC LIMIT 500",
    )?;
    let rows = stmt.query_map(params![conversation_id], |r| {
        Ok(Message {
            id: r.get(0)?,
            conversation_id: r.get(1)?,
            role: r.get(2)?,
            content: r.get(3)?,
            seq: r.get(4)?,
            created_at: r.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}
