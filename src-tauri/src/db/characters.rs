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
        "SELECT id, name, tags, nsfw, updated_at FROM characters ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(CharacterSummary {
            id: r.get(0)?,
            name: r.get(1)?,
            tags: parse_json_string_array(r.get(2)?),
            nsfw: r.get::<_, i64>(3)? != 0,
            updated_at: r.get(4)?,
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
    conn.execute(
        "INSERT INTO characters
           (id, name, description, personality, scenario, first_messages,
            example_messages, system_prompt, tags, nsfw, avatar, extensions,
            created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
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
        ],
    )?;
    get_required(conn, &id)
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
