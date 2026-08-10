use std::path::Path;

use tauri::State;

use crate::avatar;
use crate::cards;
use crate::db::{characters, conversations, lorebooks};
use crate::models::{Character, CharacterInput, CharacterSummary};
use crate::state::AppState;

use super::chat::active_conversation_id;
use super::with_db;

#[tauri::command]
pub fn list_characters(state: State<AppState>) -> Result<Vec<CharacterSummary>, String> {
    with_db(&state, |conn| characters::list_summaries(conn))
}

#[tauri::command]
pub fn get_character(state: State<AppState>, id: String) -> Result<Character, String> {
    with_db(&state, |conn| characters::get_required(conn, &id))
}

#[tauri::command]
pub fn create_character(
    state: State<AppState>,
    input: CharacterInput,
) -> Result<Character, String> {
    with_db(&state, |conn| characters::create(conn, &input))
}

#[tauri::command]
pub fn update_character(
    state: State<AppState>,
    id: String,
    input: CharacterInput,
) -> Result<Character, String> {
    with_db(&state, |conn| characters::update(conn, &id, &input))
}

#[tauri::command]
pub fn delete_character(state: State<AppState>, id: String) -> Result<(), String> {
    // 该角色有对话正在生成时删除会级联丢失流式回复，拒绝
    with_db(&state, |conn| {
        let convs = conversations::list_by_character(conn, &id)?;
        if let Some(active) = active_conversation_id(&state) {
            if convs.iter().any(|c| c.id == active) {
                return Err(crate::error::AppError::other("该角色有对话正在生成回复，请先停止"));
            }
        }
        characters::delete(conn, &id)
    })
}

/// 拖拽排序：按给定 id 顺序重排全部角色
#[tauri::command]
pub fn reorder_characters(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    with_db(&state, |conn| characters::reorder(conn, &ids))
}

#[tauri::command]
pub fn import_card(state: State<AppState>, path: String) -> Result<Character, String> {
    // 文件读取在锁外进行（避免大 PNG 卡阻塞数据库操作）
    let (data, avatar_bytes) =
        cards::io::read_card(Path::new(&path)).map_err(|e| e.to_string())?;
    let mut input = cards::spec::card_to_input(&data);
    input.avatar = avatar_bytes.map(|b| avatar::encode(&b));
    with_db(&state, |conn| {
        // 角色创建 + 世界书保存同一事务，失败整体回滚（重试不产生重复角色）
        let tx = conn.unchecked_transaction()?;
        let character = characters::create(&tx, &input)?;
        if let Some(book) = data.character_book.as_ref() {
            if let Some(lore_input) = cards::spec::character_book_to_lore_input(book) {
                lorebooks::save_inner(&tx, &character.id, &lore_input)?;
            }
        }
        tx.commit()?;
        Ok(character)
    })
}

#[tauri::command]
pub fn export_card(state: State<AppState>, id: String, path: String) -> Result<(), String> {
    // 锁内只读数据，写文件在锁外
    let (c, lorebook) = with_db(&state, |conn| {
        let c = characters::get_required(conn, &id)?;
        let lorebook = lorebooks::get_by_character(conn, &id)?;
        Ok((c, lorebook))
    })?;
    cards::io::write_card(Path::new(&path), &c, lorebook.as_ref())
        .map_err(|e| e.to_string())
}
