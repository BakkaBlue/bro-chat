use tauri::State;

use crate::db::conversations;
use crate::db::messages;
use crate::models::{ConversationSummary, Message};
use crate::state::AppState;

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
    with_db(&state, |conn| conversations::delete(conn, &id))
}

#[tauri::command]
pub fn get_messages(
    state: State<AppState>,
    conversation_id: String,
) -> Result<Vec<Message>, String> {
    with_db(&state, |conn| messages::list(conn, &conversation_id))
}
