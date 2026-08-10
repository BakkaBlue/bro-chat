use rusqlite::Connection;

use crate::error::AppResult;
use crate::state::AppState;

pub mod character;
pub mod chat;
pub mod conversation;
pub mod settings;

/// 锁库并执行数据层函数，错误转为给前端的中文消息
pub(crate) fn with_db<T>(
    state: &AppState,
    f: impl FnOnce(&Connection) -> AppResult<T>,
) -> Result<T, String> {
    let conn = state.db.lock().unwrap();
    f(&conn).map_err(|e| e.to_string())
}
