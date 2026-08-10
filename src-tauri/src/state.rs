use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tokio::sync::oneshot;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    /// 单飞流式生成槽：一次只允许一个活跃生成
    pub chat: Arc<Mutex<Option<ActiveChat>>>,
}

pub struct ActiveChat {
    pub request_id: String,
    /// 生成所属的对话（删除/清理命令用它判断是否应拒绝操作）
    pub conversation_id: String,
    /// 取消信号：cancel_chat 只 take 发送器发信号、不清槽位；
    /// 槽位一律由流式任务退出时清理，避免旧任务与新消息的 seq 竞态。
    pub cancel_tx: Mutex<Option<oneshot::Sender<()>>>,
}
