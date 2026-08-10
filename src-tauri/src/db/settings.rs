use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::Settings;

fn get_str(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |r| r.get::<_, String>(0))?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

/// 存储值合并默认值。所有值以 JSON 字符串存储。
pub fn get(conn: &Connection) -> AppResult<Settings> {
    let d = Settings::default();
    Ok(Settings {
        base_url: get_str(conn, "base_url")?.unwrap_or(d.base_url),
        api_key: get_str(conn, "api_key")?.unwrap_or_default(),
        model: get_str(conn, "model")?.unwrap_or(d.model),
        temperature: get_str(conn, "temperature")?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(d.temperature),
        max_tokens: get_str(conn, "max_tokens")?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(d.max_tokens),
        max_context_tokens: get_str(conn, "max_context_tokens")?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(d.max_context_tokens),
        system_prompt: get_str(conn, "system_prompt")?.unwrap_or_default(),
    })
}

/// 整体 upsert 全部 7 个键。
pub fn update(conn: &Connection, s: &Settings) -> AppResult<()> {
    let entries: [(&str, String); 7] = [
        ("base_url", s.base_url.clone()),
        ("api_key", s.api_key.clone()),
        ("model", s.model.clone()),
        ("temperature", serde_json::to_string(&s.temperature)?),
        ("max_tokens", serde_json::to_string(&s.max_tokens)?),
        (
            "max_context_tokens",
            serde_json::to_string(&s.max_context_tokens)?,
        ),
        ("system_prompt", s.system_prompt.clone()),
    ];
    for (key, value) in entries {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
    }
    Ok(())
}
