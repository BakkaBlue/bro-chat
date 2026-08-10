pub mod avatar;
pub mod cards;
mod commands;
pub mod db;
mod error;
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
                chat: std::sync::Mutex::new(None),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
