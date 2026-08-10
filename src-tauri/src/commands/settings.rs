use tauri::State;

use crate::db::settings as settings_db;
use crate::llm::client::fetch_models;
use crate::models::Settings;
use crate::state::AppState;

use super::with_db;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    with_db(&state, |conn| settings_db::get(conn))
}

#[tauri::command]
pub fn update_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    with_db(&state, |conn| settings_db::update(conn, &settings))
}

/// 从上游拉取模型列表（OpenAI 兼容 GET /v1/models）
#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (base_url, api_key) = {
        let conn = state.db.lock().unwrap();
        let s = settings_db::get(&conn).map_err(|e| e.to_string())?;
        (s.base_url, s.api_key)
    };
    fetch_models(&base_url, &api_key).await
}
