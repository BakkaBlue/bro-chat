pub mod avatar;
pub mod cards;
mod commands;
pub mod db;
mod error;
pub mod llm;
pub mod models;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db = db::init_app(app.handle())?;
            app.manage(state::AppState {
                db,
                chat: std::sync::Arc::new(std::sync::Mutex::new(None)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::character::list_characters,
            commands::character::get_character,
            commands::character::create_character,
            commands::character::update_character,
            commands::character::delete_character,
            commands::character::import_card,
            commands::character::export_card,
            commands::conversation::list_conversations,
            commands::conversation::create_conversation,
            commands::conversation::rename_conversation,
            commands::conversation::delete_conversation,
            commands::conversation::get_messages,
            commands::conversation::update_message,
            commands::conversation::clear_conversation,
            commands::chat::send_message,
            commands::chat::cancel_chat,
            commands::chat::regenerate,
            commands::lorebook::get_lorebook,
            commands::lorebook::save_lorebook,
            commands::lorebook::delete_lorebook,
            commands::lorebook::import_worldbook_file,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::list_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
