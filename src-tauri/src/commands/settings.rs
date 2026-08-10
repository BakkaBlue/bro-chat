use tauri::State;

use crate::db::settings;
use crate::models::Settings;
use crate::state::AppState;

use super::with_db;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    with_db(&state, |conn| settings::get(conn))
}

#[tauri::command]
pub fn update_settings(state: State<AppState>, settings_input: Settings) -> Result<(), String> {
    with_db(&state, |conn| settings::update(conn, &settings_input))
}
