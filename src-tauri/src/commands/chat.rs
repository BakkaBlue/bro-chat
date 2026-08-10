//! 流式聊天：send_message 组装上下文并 spawn 流任务；cancel_chat 取消。
//! 事件协议（Rust → 前端）：
//!   chat:chunk      { requestId, delta }
//!   chat:done       { requestId, messageId }
//!   chat:error      { requestId, message, partialSaved }
//!   chat:cancelled  { requestId, partialSaved }

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::db::{characters, conversations, lorebooks, messages, settings};
use crate::error::AppResult;
use crate::llm::client::{build_body, build_request_messages, chat_url};
use crate::llm::lorebook::{LoreInjection, build_lore_injection, scan_text_from};
use crate::llm::stream::{StreamConfig, stream_chat};
use crate::models::{Character, Message, Settings};
use crate::state::{ActiveChat, AppState};

/// 计算世界书注入：启用且有条目时按扫描深度取文本、按预算注入
fn lore_for(
    conn: &rusqlite::Connection,
    character_id: &str,
    history: &[Message],
) -> AppResult<LoreInjection> {
    let book = lorebooks::get_by_character(conn, character_id)?;
    Ok(match book {
        Some(b) if b.enabled && !b.entries.is_empty() => {
            let scan_text = scan_text_from(history, b.scan_depth as usize);
            build_lore_injection(&b.entries, &scan_text, b.token_budget as usize)
        }
        _ => LoreInjection::default(),
    })
}

// 事件 payload 统一 camelCase，与前端 api/events.ts 类型一致
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChunkEvent {
    request_id: String,
    delta: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    request_id: String,
    message_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    request_id: String,
    message: String,
    partial_saved: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CancelledEvent {
    request_id: String,
    partial_saved: bool,
}

/// 发送一条用户消息，返回 requestId。
/// 流程：单飞检查 → 快照（角色/设置/插用户消息/取历史）→ 组上下文 → spawn 流任务。
#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    app: AppHandle,
    conversation_id: String,
    content: String,
) -> Result<String, String> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err("消息不能为空".into());
    }

    let request_id = Uuid::new_v4().to_string();

    // 单飞检查 + 数据快照在同一个锁区（同步段无 await，无竞争窗口）
    let (character, s, history, lore, cancel_rx) = {
        let mut slot = state.chat.lock().unwrap();
        if slot.is_some() {
            return Err("已有生成中的回复，请先停止".into());
        }
        let snapshot: AppResult<(Character, Settings, Vec<Message>, LoreInjection)> = (|| {
            let conn = state.db.lock().unwrap();
            let conv = conversations::get_required(&conn, &conversation_id)?;
            let character = characters::get_required(&conn, &conv.character_id)?;
            let s = settings::get(&conn)?;
            messages::insert(&conn, &conversation_id, "user", &content)?;
            let history = messages::list(&conn, &conversation_id)?;
            // 第一条用户消息自动生成标题
            let user_count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1 AND role = 'user'",
                rusqlite::params![conversation_id],
                |r| r.get(0),
            )?;
            if user_count == 1 {
                let title: String = content.chars().take(24).collect::<String>()
                    + if content.chars().count() > 24 { "…" } else { "" };
                conversations::rename_if_untitled(&conn, &conversation_id, &title)?;
            }
            let lore = lore_for(&conn, &conv.character_id, &history)?;
            Ok((character, s, history, lore))
        })();
        let (character, s, history, lore) = snapshot.map_err(|e| e.to_string())?;
        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
        *slot = Some(ActiveChat {
            request_id: request_id.clone(),
            cancel_tx,
        });
        (character, s, history, lore, cancel_rx)
    };

    let request_messages = build_request_messages(&character, &s, &history, &lore);
    let body = build_body(&s, &request_messages);
    // 调试：把完整提示词打到控制台（tauri dev 终端可见）
    if s.chat_debug_prompt {
        log::debug!(
            "[提示词] 对话 {conversation_id}:\n{}",
            serde_json::to_string_pretty(&body).unwrap_or_default()
        );
    }
    let cfg = StreamConfig {
        url: chat_url(&s.base_url),
        api_key: s.api_key.clone(),
        body,
    };

    spawn_stream_task(state.inner(), app, request_id.clone(), cancel_rx, cfg, conversation_id);
    Ok(request_id)
}

/// 重新生成最后一条 assistant 回复：删除该条后重新发起流式请求。
/// 若最后一条是 user 消息（无回复可删），直接重新生成。
#[tauri::command]
pub async fn regenerate(
    state: State<'_, AppState>,
    app: AppHandle,
    conversation_id: String,
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();

    let (character, s, history, lore, cancel_rx) = {
        let mut slot = state.chat.lock().unwrap();
        if slot.is_some() {
            return Err("已有生成中的回复，请先停止".into());
        }
        let snapshot: AppResult<(Character, Settings, Vec<Message>, LoreInjection)> = (|| {
            let conn = state.db.lock().unwrap();
            let conv = conversations::get_required(&conn, &conversation_id)?;
            let character = characters::get_required(&conn, &conv.character_id)?;
            let s = settings::get(&conn)?;
            let mut history = messages::list(&conn, &conversation_id)?;
            if let Some(last) = history.last() {
                if last.role == "assistant" {
                    messages::delete_by_id(&conn, &last.id)?;
                    history.pop();
                }
            }
            let lore = lore_for(&conn, &conv.character_id, &history)?;
            Ok((character, s, history, lore))
        })();
        let (character, s, history, lore) = snapshot.map_err(|e| e.to_string())?;
        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
        *slot = Some(ActiveChat {
            request_id: request_id.clone(),
            cancel_tx,
        });
        (character, s, history, lore, cancel_rx)
    };

    let request_messages = build_request_messages(&character, &s, &history, &lore);
    let body = build_body(&s, &request_messages);
    let cfg = StreamConfig {
        url: chat_url(&s.base_url),
        api_key: s.api_key.clone(),
        body,
    };

    spawn_stream_task(state.inner(), app, request_id.clone(), cancel_rx, cfg, conversation_id);
    Ok(request_id)
}

/// 组流式任务配置并 spawn（send_message / regenerate 共用）
fn spawn_stream_task(
    state: &AppState,
    app: AppHandle,
    request_id: String,
    cancel_rx: oneshot::Receiver<()>,
    cfg: StreamConfig,
    conversation_id: String,
) {
    let db = state.db.clone();
    let chat_slot = state.chat.clone();
    tauri::async_runtime::spawn(stream_task(
        app,
        db,
        chat_slot,
        request_id,
        cancel_rx,
        cfg,
        conversation_id,
    ));
}

#[tauri::command]
pub fn cancel_chat(state: State<AppState>, request_id: String) -> Result<(), String> {
    let mut slot = state.chat.lock().unwrap();
    if let Some(active) = slot.as_ref() {
        if active.request_id == request_id {
            // 取出槽位发送取消；槽位的清理由流任务退出时兜底（幂等）
            if let Some(active) = slot.take() {
                let _ = active.cancel_tx.send(());
            }
        }
    }
    Ok(())
}

async fn stream_task(
    app: AppHandle,
    db: Arc<Mutex<rusqlite::Connection>>,
    chat_slot: Arc<Mutex<Option<ActiveChat>>>,
    request_id: String,
    cancel_rx: oneshot::Receiver<()>,
    cfg: StreamConfig,
    conversation_id: String,
) {
    // 流式请求：逐 delta 转发给前端
    let result = stream_chat(&cfg, Some(cancel_rx), |delta| {
        let _ = app.emit(
            "chat:chunk",
            ChunkEvent {
                request_id: request_id.clone(),
                delta: delta.to_string(),
            },
        );
    })
    .await;

    // 收尾：保存回复（正常完成时空回复也保存，保证消息流完整）
    let (saved_id, partial_saved) = if result.error.is_none() && !result.cancelled {
        let conn = db.lock().unwrap();
        let id = messages::insert(&conn, &conversation_id, "assistant", &result.text)
            .ok()
            .map(|m| m.id);
        (id, !result.text.is_empty())
    } else if !result.text.is_empty() {
        let conn = db.lock().unwrap();
        let id = messages::insert(&conn, &conversation_id, "assistant", &result.text)
            .ok()
            .map(|m| m.id);
        (id, true)
    } else {
        (None, false)
    };

    if result.error.is_none() && !result.cancelled {
        match saved_id {
            Some(message_id) => {
                let _ = app.emit(
                    "chat:done",
                    DoneEvent {
                        request_id: request_id.clone(),
                        message_id,
                    },
                );
            }
            None => {
                let _ = app.emit(
                    "chat:error",
                    ErrorEvent {
                        request_id: request_id.clone(),
                        message: "回复保存失败".into(),
                        partial_saved,
                    },
                );
            }
        }
    } else if result.cancelled {
        let _ = app.emit(
            "chat:cancelled",
            CancelledEvent {
                request_id: request_id.clone(),
                partial_saved,
            },
        );
    } else {
        let _ = app.emit(
            "chat:error",
            ErrorEvent {
                request_id: request_id.clone(),
                message: result.error.unwrap_or_default(),
                partial_saved,
            },
        );
    }

    clear_slot(&chat_slot, &request_id);
}

fn clear_slot(chat_slot: &Arc<Mutex<Option<ActiveChat>>>, request_id: &str) {
    let mut slot = chat_slot.lock().unwrap();
    if let Some(active) = slot.as_ref() {
        if active.request_id == request_id {
            *slot = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 事件 payload 必须输出 camelCase，前端 api/events.ts 按此解析
    #[test]
    fn event_payloads_serialize_camel_case() {
        let chunk = serde_json::to_value(ChunkEvent {
            request_id: "r1".into(),
            delta: "d".into(),
        })
        .unwrap();
        assert_eq!(chunk["requestId"], "r1");
        assert!(chunk.get("request_id").is_none());

        let done = serde_json::to_value(DoneEvent {
            request_id: "r1".into(),
            message_id: "m1".into(),
        })
        .unwrap();
        assert_eq!(done["messageId"], "m1");

        let err = serde_json::to_value(ErrorEvent {
            request_id: "r1".into(),
            message: "boom".into(),
            partial_saved: true,
        })
        .unwrap();
        assert_eq!(err["partialSaved"], true);

        let cancelled = serde_json::to_value(CancelledEvent {
            request_id: "r1".into(),
            partial_saved: false,
        })
        .unwrap();
        assert_eq!(cancelled["requestId"], "r1");
        assert_eq!(cancelled["partialSaved"], false);
    }
}
