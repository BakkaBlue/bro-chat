use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::Settings;

/// 存储值合并默认值。所有值以 JSON 字符串存储。
pub fn get(conn: &Connection) -> AppResult<Settings> {
    let mut s = Settings::default();
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (k, v) = row?;
        let set = |target: &mut String| *target = v.clone();
        match k.as_str() {
            "base_url" => set(&mut s.base_url),
            "api_key" => set(&mut s.api_key),
            "model" => set(&mut s.model),
            "system_prompt" => set(&mut s.system_prompt),
            "ui_theme" => set(&mut s.ui_theme),
            "ui_avatar_style" => set(&mut s.ui_avatar_style),
            "ui_chat_style" => set(&mut s.ui_chat_style),
            "chat_enter_mode" => set(&mut s.chat_enter_mode),
            "temperature" => parse_into(&v, &mut s.temperature),
            "max_tokens" => parse_into(&v, &mut s.max_tokens),
            "max_context_tokens" => parse_into(&v, &mut s.max_context_tokens),
            "ui_font_size" => parse_into(&v, &mut s.ui_font_size),
            "chat_load_messages" => parse_into(&v, &mut s.chat_load_messages),
            "ui_show_timestamps" => parse_into(&v, &mut s.ui_show_timestamps),
            "ui_avatar_hover_zoom" => parse_into(&v, &mut s.ui_avatar_hover_zoom),
            "ui_reduce_motion" => parse_into(&v, &mut s.ui_reduce_motion),
            "ui_text_shadow" => parse_into(&v, &mut s.ui_text_shadow),
            "ui_message_animation" => parse_into(&v, &mut s.ui_message_animation),
            "ui_auto_expand_actions" => parse_into(&v, &mut s.ui_auto_expand_actions),
            "ui_reply_timer" => parse_into(&v, &mut s.ui_reply_timer),
            "ui_show_floor" => parse_into(&v, &mut s.ui_show_floor),
            "ui_show_token_count" => parse_into(&v, &mut s.ui_show_token_count),
            "ui_click_to_edit" => parse_into(&v, &mut s.ui_click_to_edit),
            "char_show_version" => parse_into(&v, &mut s.char_show_version),
            "chat_sound" => parse_into(&v, &mut s.chat_sound),
            "chat_debug_prompt" => parse_into(&v, &mut s.chat_debug_prompt),
            "chat_auto_scroll" => parse_into(&v, &mut s.chat_auto_scroll),
            "chat_confirm_delete" => parse_into(&v, &mut s.chat_confirm_delete),
            "chat_block_external_media" => parse_into(&v, &mut s.chat_block_external_media),
            "chat_substitute_in_assistant" => parse_into(&v, &mut s.chat_substitute_in_assistant),
            "chat_auto_load_last" => parse_into(&v, &mut s.chat_auto_load_last),
            _ => {}
        }
    }
    Ok(s)
}

fn parse_into<T: serde::de::DeserializeOwned>(v: &str, target: &mut T) {
    if let Ok(x) = serde_json::from_str(v) {
        *target = x;
    }
}

/// 整体 upsert 全部设置键。
pub fn update(conn: &Connection, s: &Settings) -> AppResult<()> {
    let entries: [(&str, String); 31] = [
        ("base_url", s.base_url.clone()),
        ("api_key", s.api_key.clone()),
        ("model", s.model.clone()),
        ("system_prompt", s.system_prompt.clone()),
        ("temperature", serde_json::to_string(&s.temperature)?),
        ("max_tokens", serde_json::to_string(&s.max_tokens)?),
        (
            "max_context_tokens",
            serde_json::to_string(&s.max_context_tokens)?,
        ),
        ("ui_theme", s.ui_theme.clone()),
        ("ui_font_size", serde_json::to_string(&s.ui_font_size)?),
        ("ui_avatar_style", s.ui_avatar_style.clone()),
        ("ui_chat_style", s.ui_chat_style.clone()),
        ("ui_show_timestamps", serde_json::to_string(&s.ui_show_timestamps)?),
        (
            "ui_avatar_hover_zoom",
            serde_json::to_string(&s.ui_avatar_hover_zoom)?,
        ),
        ("ui_reduce_motion", serde_json::to_string(&s.ui_reduce_motion)?),
        ("ui_text_shadow", serde_json::to_string(&s.ui_text_shadow)?),
        (
            "ui_message_animation",
            serde_json::to_string(&s.ui_message_animation)?,
        ),
        (
            "ui_auto_expand_actions",
            serde_json::to_string(&s.ui_auto_expand_actions)?,
        ),
        ("ui_reply_timer", serde_json::to_string(&s.ui_reply_timer)?),
        ("ui_show_floor", serde_json::to_string(&s.ui_show_floor)?),
        (
            "ui_show_token_count",
            serde_json::to_string(&s.ui_show_token_count)?,
        ),
        ("ui_click_to_edit", serde_json::to_string(&s.ui_click_to_edit)?),
        ("char_show_version", serde_json::to_string(&s.char_show_version)?),
        ("chat_sound", serde_json::to_string(&s.chat_sound)?),
        (
            "chat_debug_prompt",
            serde_json::to_string(&s.chat_debug_prompt)?,
        ),
        (
            "chat_load_messages",
            serde_json::to_string(&s.chat_load_messages)?,
        ),
        ("chat_auto_scroll", serde_json::to_string(&s.chat_auto_scroll)?),
        (
            "chat_confirm_delete",
            serde_json::to_string(&s.chat_confirm_delete)?,
        ),
        (
            "chat_block_external_media",
            serde_json::to_string(&s.chat_block_external_media)?,
        ),
        (
            "chat_substitute_in_assistant",
            serde_json::to_string(&s.chat_substitute_in_assistant)?,
        ),
        ("chat_enter_mode", s.chat_enter_mode.clone()),
        (
            "chat_auto_load_last",
            serde_json::to_string(&s.chat_auto_load_last)?,
        ),
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
