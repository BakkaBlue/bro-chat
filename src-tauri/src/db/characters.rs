use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::avatar;
use crate::error::{AppError, AppResult};
use crate::models::{Character, CharacterInput, CharacterSummary};

fn parse_json_string_array(s: String) -> Vec<String> {
    serde_json::from_str(&s).unwrap_or_default()
}

pub fn list_summaries(conn: &Connection) -> AppResult<Vec<CharacterSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, tags, nsfw, avatar, extensions, updated_at
         FROM characters ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        let avatar: Option<Vec<u8>> = r.get(4)?;
        let extensions: Option<String> = r.get(5)?;
        let character_version = extensions
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| {
                v.get("_v2_extra")
                    .and_then(|e| e.get("character_version"))
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
            });
        Ok(CharacterSummary {
            id: r.get(0)?,
            name: r.get(1)?,
            tags: parse_json_string_array(r.get(2)?),
            nsfw: r.get::<_, i64>(3)? != 0,
            avatar: avatar.as_deref().map(avatar::encode),
            character_version,
            updated_at: r.get(6)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Option<Character>> {
    conn.query_row(
        "SELECT id, name, description, personality, scenario, first_messages,
                example_messages, system_prompt, tags, nsfw, avatar, extensions,
                created_at, updated_at
         FROM characters WHERE id = ?1",
        params![id],
        |r| {
            let avatar: Option<Vec<u8>> = r.get(10)?;
            let extensions: Option<String> = r.get(11)?;
            Ok(Character {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                personality: r.get(3)?,
                scenario: r.get(4)?,
                first_messages: parse_json_string_array(r.get(5)?),
                example_messages: r.get(6)?,
                system_prompt: r.get(7)?,
                tags: parse_json_string_array(r.get(8)?),
                nsfw: r.get::<_, i64>(9)? != 0,
                avatar: avatar.as_deref().map(avatar::encode),
                extensions: extensions.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: r.get(12)?,
                updated_at: r.get(13)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub fn get_required(conn: &Connection, id: &str) -> AppResult<Character> {
    get(conn, id)?
        .ok_or_else(|| AppError::other(format!("角色不存在: {id}")))
}

pub fn create(conn: &Connection, input: &CharacterInput) -> AppResult<Character> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let avatar = avatar::decode(input.avatar.as_deref())?;
    let sort_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM characters",
        [],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO characters
           (id, name, description, personality, scenario, first_messages,
            example_messages, system_prompt, tags, nsfw, avatar, extensions,
            created_at, updated_at, sort_order)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![
            id,
            input.name,
            input.description,
            input.personality,
            input.scenario,
            serde_json::to_string(&input.first_messages)?,
            input.example_messages,
            input.system_prompt,
            serde_json::to_string(&input.tags)?,
            input.nsfw as i64,
            avatar,
            input.extensions.as_ref().map(|e| e.to_string()),
            now,
            now,
            sort_order,
        ],
    )?;
    get_required(conn, &id)
}

/// 按给定 id 顺序重排（拖拽排序持久化）
pub fn reorder(conn: &Connection, ids: &[String]) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE characters SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn update(conn: &Connection, id: &str, input: &CharacterInput) -> AppResult<Character> {
    let now = Utc::now().to_rfc3339();
    let avatar = avatar::decode(input.avatar.as_deref())?;
    let n = conn.execute(
        "UPDATE characters SET
           name=?1, description=?2, personality=?3, scenario=?4,
           first_messages=?5, example_messages=?6, system_prompt=?7,
           tags=?8, nsfw=?9, avatar=?10, extensions=?11, updated_at=?12
         WHERE id=?13",
        params![
            input.name,
            input.description,
            input.personality,
            input.scenario,
            serde_json::to_string(&input.first_messages)?,
            input.example_messages,
            input.system_prompt,
            serde_json::to_string(&input.tags)?,
            input.nsfw as i64,
            avatar,
            input.extensions.as_ref().map(|e| e.to_string()),
            now,
            id,
        ],
    )?;
    if n == 0 {
        return Err(AppError::other(format!("角色不存在: {id}")));
    }
    get_required(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM characters WHERE id = ?1", params![id])?;
    Ok(())
}
