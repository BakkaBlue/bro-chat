use tauri::State;

use crate::db::lorebooks;
use crate::models::{Lorebook, LorebookInput};
use crate::state::AppState;

use super::with_db;

#[tauri::command]
pub fn get_lorebook(
    state: State<AppState>,
    character_id: String,
) -> Result<Option<Lorebook>, String> {
    with_db(&state, |conn| lorebooks::get_by_character(conn, &character_id))
}

/// 整书替换保存
#[tauri::command]
pub fn save_lorebook(
    state: State<AppState>,
    character_id: String,
    input: LorebookInput,
) -> Result<Lorebook, String> {
    with_db(&state, |conn| lorebooks::save(conn, &character_id, &input))
}

#[tauri::command]
pub fn delete_lorebook(state: State<AppState>, character_id: String) -> Result<(), String> {
    with_db(&state, |conn| lorebooks::delete_by_character(conn, &character_id))
}
