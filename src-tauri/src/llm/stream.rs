//! 流式请求 OpenAI 兼容接口：HTTP + SSE 循环。
//! 与 Tauri 命令解耦（回调逐 delta 输出），核心逻辑可直接单元测试。

use std::time::Duration;

use futures_util::StreamExt;
use reqwest::Client;
use tokio::sync::oneshot;

use super::sse::{SseParser, extract_delta};

pub struct StreamConfig {
    pub url: String,
    pub api_key: String,
    pub body: serde_json::Value,
}

#[derive(Debug, Default)]
pub struct StreamResult {
    pub text: String,
    pub error: Option<String>,
    pub cancelled: bool,
}

/// 流式请求。on_chunk 每个 delta 回调一次（含空 delta 外的全部内容）。
/// 所有失败（客户端初始化/连接失败/HTTP 错误/网络中断）记录在 error，
/// 部分文本始终保留在 text 中，调用方决定是否保存。
pub async fn stream_chat(
    cfg: &StreamConfig,
    cancel_rx: Option<oneshot::Receiver<()>>,
    mut on_chunk: impl FnMut(&str),
) -> StreamResult {
    let mut result = StreamResult::default();

    let client = match Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            result.error = Some(format!("HTTP 客户端初始化失败: {e}"));
            return result;
        }
    };
    let mut req = client
        .post(&cfg.url)
        .json(&cfg.body)
        .header("Accept", "text/event-stream");
    if !cfg.api_key.is_empty() {
        req = req.bearer_auth(&cfg.api_key);
    }
    let response = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            result.error = Some(format!("请求失败: {e}"));
            return result;
        }
    };
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        result.error = Some(format!("HTTP {status}: {}", truncate(&text, 300)));
        return result;
    }

    let mut parser = SseParser::new();
    let mut stream = response.bytes_stream();
    let mut cancel_rx = cancel_rx;
    let mut done = false;
    loop {
        // 无取消信号时该分支永远 pending
        let cancel_fut = async {
            match &mut cancel_rx {
                Some(rx) => {
                    let _ = rx.await;
                }
                None => std::future::pending().await,
            }
        };
        tokio::select! {
            _ = cancel_fut => {
                result.cancelled = true;
                done = true;
            }
            next = stream.next() => match next {
                Some(Ok(bytes)) => {
                    for payload in parser.push(&bytes) {
                        if payload == "[DONE]" {
                            done = true;
                            break;
                        }
                        if let Some(delta) = extract_delta(&payload) {
                            result.text.push_str(&delta);
                            on_chunk(&delta);
                        }
                    }
                }
                Some(Err(e)) => {
                    result.error = Some(format!("网络中断: {e}"));
                    done = true;
                }
                None => done = true, // EOF（服务端未发 [DONE] 也视为正常结束）
            },
        }
        if done {
            break;
        }
    }
    // EOF 后冲刷残留（可能没有最后的空行）
    for payload in parser.finish() {
        if payload == "[DONE]" {
            continue;
        }
        if let Some(delta) = extract_delta(&payload) {
            result.text.push_str(&delta);
            on_chunk(&delta);
        }
    }
    result
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push_str("…");
        out
    }
}
