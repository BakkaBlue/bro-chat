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

fn get_i64(conn: &Connection, key: &str) -> AppResult<Option<i64>> {
    Ok(get_str(conn, key)?
        .and_then(|s| serde_json::from_str(&s).ok()))
}

fn get_f64(conn: &Connection, key: &str) -> AppResult<Option<f64>> {
    Ok(get_str(conn, key)?
        .and_then(|s| serde_json::from_str(&s).ok()))
}

/// 存储值合并默认值。所有值以 JSON 字符串存储。
pub fn get(conn: &Connection) -> AppResult<Settings> {
    let d = Settings::default();
    Ok(Settings {
        base_url: get_str(conn, "base_url")?.unwrap_or(d.base_url),
        api_key: get_str(conn, "api_key")?.unwrap_or_default(),
        model: get_str(conn, "model")?.unwrap_or(d.model),
        temperature: get_f64(conn, "temperature")?.unwrap_or(d.temperature),
        max_tokens: get_i64(conn, "max_tokens")?.unwrap_or(d.max_tokens),
        max_context_tokens: get_i64(conn, "max_context_tokens")?.unwrap_or(d.max_context_tokens),
        system_prompt: get_str(conn, "system_prompt")?.unwrap_or_default(),
        ui_theme: get_str(conn, "ui_theme")?.unwrap_or(d.ui_theme),
        ui_font_size: get_i64(conn, "ui_font_size")?.unwrap_or(d.ui_font_size),
    })
}

/// 整体 upsert 全部 9 个键。
pub fn update(conn: &Connection, s: &Settings) -> AppResult<()> {
    let entries: [(&str, String); 9] = [
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
        ("ui_theme", s.ui_theme.clone()),
        ("ui_font_size", serde_json::to_string(&s.ui_font_size)?),
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
