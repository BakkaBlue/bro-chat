pub mod characters;
pub mod conversations;
pub mod messages;
pub mod migrations;
pub mod settings;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tauri::Manager;

use crate::error::AppResult;

/// 打开数据库连接：建目录、WAL、外键、busy_timeout、迁移。
/// 数据文件在 `%APPDATA%\com.bakkablue.brochat\brochat.db`。
pub fn init_conn(path: &Path) -> AppResult<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut conn = Connection::open(path)?;
    apply_conn_settings(&mut conn)?;
    Ok(conn)
}

/// 内存数据库（测试用）
pub fn init_conn_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    apply_conn_settings(&mut conn)?;
    Ok(conn)
}

fn apply_conn_settings(conn: &mut Connection) -> AppResult<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    migrations::migrate(conn)?;
    Ok(())
}

/// Tauri 应用启动时初始化数据库并放入 AppState。
pub fn init_app(app: &tauri::AppHandle) -> AppResult<Arc<Mutex<Connection>>> {
    let dir = app.path().app_data_dir()?;
    let conn = init_conn(&dir.join("brochat.db"))?;
    Ok(Arc::new(Mutex::new(conn)))
}
