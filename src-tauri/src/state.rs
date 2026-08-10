use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    /// 单飞流式生成槽：一次只允许一个活跃生成
    pub chat: Arc<Mutex<Option<ActiveChat>>>,
}

pub struct ActiveChat {
    pub request_id: String,
    pub cancel_tx: tokio::sync::oneshot::Sender<()>,
}
