use std::sync::{Arc, Mutex};

use rusqlite::Connection;

// db 在 Stage 2 的命令层读取；chat 槽在 Stage 3 的流式生成读取
#[allow(dead_code)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    /// 单飞流式生成槽：一次只允许一个活跃生成
    pub chat: Mutex<Option<ActiveChat>>,
}

#[allow(dead_code)]
pub struct ActiveChat {
    pub request_id: String,
    pub cancel_tx: tokio::sync::oneshot::Sender<()>,
}
