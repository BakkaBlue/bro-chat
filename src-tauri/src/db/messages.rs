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

/// 按 id 删除单条消息（重新生成时删除最后一条 assistant 回复）
pub fn delete_by_id(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
    Ok(())
}

/// 删除从指定 seq 开始的所有消息（重新发送用户消息时截断其后内容）
pub fn delete_from_seq(conn: &Connection, conversation_id: &str, seq: i64) -> AppResult<()> {
    conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1 AND seq >= ?2",
        params![conversation_id, seq],
    )?;
    Ok(())
}

/// 编辑消息内容
pub fn update_content(conn: &Connection, id: &str, content: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, id],
    )?;
    Ok(())
}

/// 清空对话的全部消息
pub fn delete_all(conn: &Connection, conversation_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    Ok(())
}

/// 按 seq 升序取对话消息，上限 limit 条（设置里的聊天加载条数）。
pub fn list_limited(conn: &Connection, conversation_id: &str, limit: i64) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, seq, created_at
         FROM messages WHERE conversation_id = ?1 ORDER BY seq ASC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![conversation_id, limit], |r| {
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

/// 按 seq 升序取对话消息（内部上下文组装用，无上限；
/// 裁剪由 trim_history 按 token 预算负责）。
pub fn list(conn: &Connection, conversation_id: &str) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, seq, created_at
         FROM messages WHERE conversation_id = ?1 ORDER BY seq ASC",
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
