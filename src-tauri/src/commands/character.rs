use std::path::Path;

use tauri::State;

use crate::avatar;
use crate::cards;
use crate::db::characters;
use crate::models::{Character, CharacterInput, CharacterSummary};
use crate::state::AppState;

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
    with_db(&state, |conn| characters::delete(conn, &id))
}

#[tauri::command]
pub fn import_card(state: State<AppState>, path: String) -> Result<Character, String> {
    with_db(&state, |conn| {
        let (data, avatar_bytes) = cards::io::read_card(Path::new(&path))?;
        let mut input = cards::spec::card_to_input(&data);
        input.avatar = avatar_bytes.map(|b| avatar::encode(&b));
        characters::create(conn, &input)
    })
}

#[tauri::command]
pub fn export_card(state: State<AppState>, id: String, path: String) -> Result<(), String> {
    with_db(&state, |conn| {
        let c = characters::get_required(conn, &id)?;
        cards::io::write_card(Path::new(&path), &c)
    })
}
