use tauri::State;

use crate::db::{conversations, messages, settings};
use crate::models::{ConversationSummary, Message};
use crate::state::AppState;

use super::chat::active_conversation_id;
use super::with_db;

#[tauri::command]
pub fn list_conversations(
    state: State<AppState>,
    character_id: String,
) -> Result<Vec<ConversationSummary>, String> {
    with_db(&state, |conn| conversations::list_by_character(conn, &character_id))
}

#[tauri::command]
pub fn create_conversation(
    state: State<AppState>,
    character_id: String,
    greeting_index: Option<usize>,
) -> Result<ConversationSummary, String> {
    with_db(&state, |conn| {
        let conv = conversations::create(conn, &character_id, greeting_index)?;
        let list = conversations::list_by_character(conn, &character_id)?;
        list.into_iter()
            .find(|c| c.id == conv.id)
            .ok_or_else(|| crate::error::AppError::other("创建对话后读取失败"))
    })
}

#[tauri::command]
pub fn rename_conversation(
    state: State<AppState>,
    id: String,
    title: String,
) -> Result<(), String> {
    with_db(&state, |conn| conversations::rename(conn, &id, &title))
}

#[tauri::command]
pub fn delete_conversation(state: State<AppState>, id: String) -> Result<(), String> {
    // 生成中删除会导致流式回复丢失/孤立，直接拒绝
    if active_conversation_id(&state).as_deref() == Some(id.as_str()) {
        return Err("该对话正在生成回复，请先停止".into());
    }
    with_db(&state, |conn| conversations::delete(conn, &id))
}

#[tauri::command]
pub fn get_messages(
    state: State<AppState>,
    conversation_id: String,
) -> Result<Vec<Message>, String> {
    with_db(&state, |conn| {
        let s = settings::get(conn)?;
        messages::list_limited(conn, &conversation_id, s.chat_load_messages)
    })
}

/// 编辑单条消息内容
#[tauri::command]
pub fn update_message(state: State<AppState>, id: String, content: String) -> Result<(), String> {
    with_db(&state, |conn| messages::update_content(conn, &id, &content))
}

/// 清空当前对话的全部消息
#[tauri::command]
pub fn clear_conversation(state: State<AppState>, id: String) -> Result<(), String> {
    // 生成中清理会导致流式回复"复活"进空对话，直接拒绝
    if active_conversation_id(&state).as_deref() == Some(id.as_str()) {
        return Err("该对话正在生成回复，请先停止".into());
    }
    with_db(&state, |conn| messages::delete_all(conn, &id))
}

/// 拖拽排序：按给定 id 顺序重排某角色下的对话
#[tauri::command]
pub fn reorder_conversations(
    state: State<AppState>,
    character_id: String,
    ids: Vec<String>,
) -> Result<(), String> {
    with_db(&state, |conn| conversations::reorder(conn, &character_id, &ids))
}
