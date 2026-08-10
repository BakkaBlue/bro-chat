use tauri::State;

use crate::cards;
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

/// 读取独立世界书文件（ST .json 格式）→ 世界书输入，供前端合并/编辑
#[tauri::command]
pub fn import_worldbook_file(path: String) -> Result<LorebookInput, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {e}"))?;
    // ST 世界书文件：{"name":..., "entries":[...]}，个别版本带 data 包装
    let book_v = if v.get("data").is_some() { &v["data"] } else { &v };
    cards::spec::character_book_to_lore_input(book_v)
        .ok_or_else(|| "不是有效的世界书文件（缺少 entries）".to_string())
}
