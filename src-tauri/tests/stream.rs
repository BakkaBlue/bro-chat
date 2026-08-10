// Stage 3: 流式链路端到端测试 —— 用 tokio 手写 mock OpenAI 兼容服务器，
// 覆盖：正常流式（含跨 chunk 断行）、Authorization 头、HTTP 401、
// 中途断开保留部分文本、取消保留部分文本。

use std::time::Duration;

use brochat_lib::llm::stream::{StreamConfig, stream_chat};
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

enum Scenario {
    /// 正常流式：内容跨多次写入（测试断行解析），带 [DONE]
    Success,
    /// 401 拒绝
    Http401,
    /// 发一个 chunk 后立刻断开（网络中断）
    MidStreamClose,
    /// 每 50ms 一个 chunk，持续不断（测试取消）
    SlowStream,
    /// 返回模型列表（GET /v1/models）
    Models,
}

const DELTA1: &str = "你好，世界";
const DELTA2: &str = "第二段";

/// 本机系统代理（Clash 类）会劫持 127.0.0.1 请求导致 mock 服务器 502；
/// 测试进程内统一设置 NO_PROXY 绕过。并发测试下只需设置一次。
static SET_NO_PROXY: std::sync::Once = std::sync::Once::new();
fn setup_no_proxy() {
    SET_NO_PROXY.call_once(|| {
        std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    });
}

/// SSE 行：`data: {payload}\r\n\r\n`
fn sse_line(payload: &str) -> Vec<u8> {
    format!("data: {payload}\r\n\r\n").into_bytes()
}

fn delta_chunk(content: &str) -> Vec<u8> {
    sse_line(&json!({"choices": [{"delta": {"content": content}}]}).to_string())
}

fn role_chunk() -> Vec<u8> {
    sse_line(&json!({"choices": [{"delta": {"role": "assistant"}}]}).to_string())
}

/// 启动一个一次性 mock 服务器，返回地址；
/// auth_tx 收到请求的 Authorization 头；request_line_tx 收到请求首行
async fn serve_one(
    scenario: Scenario,
    auth_tx: Option<oneshot::Sender<String>>,
    request_line_tx: Option<oneshot::Sender<String>>,
) -> String {
    setup_no_proxy();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    tokio::spawn(async move {
        let (mut sock, _) = listener.accept().await.unwrap();
        let (head, _body) = read_request(&mut sock).await;
        if let Some(tx) = auth_tx {
            let auth = head
                .lines()
                .find(|l| l.to_lowercase().starts_with("authorization:"))
                .map(|l| l.to_string())
                .unwrap_or_default();
            let _ = tx.send(auth);
        }
        if let Some(tx) = request_line_tx {
            let first = head.lines().next().unwrap_or_default().to_string();
            let _ = tx.send(first);
        }
        match scenario {
            Scenario::Success => {
                let _ = sock
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
                    )
                    .await;
                // role-only chunk（无 content）+ 跨 chunk 断行的第一个内容块
                let _ = sock.write_all(&role_chunk()).await;
                let line = format!("data: {}\r\n\r\n", json!({"choices": [{"delta": {"content": DELTA1}}]}));
                let bytes = line.into_bytes();
                let split = bytes.len() / 2;
                let _ = sock.write_all(&bytes[..split]).await;
                tokio::time::sleep(Duration::from_millis(20)).await;
                let _ = sock.write_all(&bytes[split..]).await;
                let _ = sock.write_all(&delta_chunk(DELTA2)).await;
                let _ = sock.write_all(&sse_line("[DONE]")).await;
                let _ = sock.flush().await;
            }
            Scenario::Http401 => {
                let _ = sock
                    .write_all(
                        b"HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\n\r\n{\"error\":{\"message\":\"invalid api key\"}}",
                    )
                    .await;
            }
            Scenario::MidStreamClose => {
                let _ = sock
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n")
                    .await;
                let _ = sock.write_all(&delta_chunk("你好")).await;
                let _ = sock.flush().await;
                // 等客户端先收到 chunk，再以 RST 断开（linger=0），模拟真正的网络中断
                tokio::time::sleep(Duration::from_millis(100)).await;
                #[allow(deprecated)]
                let _ = sock.set_linger(Some(Duration::from_millis(0)));
                drop(sock);
            }
            Scenario::SlowStream => {
                let _ = sock
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\n")
                    .await;
                for _ in 0..1000 {
                    let _ = sock.write_all(&delta_chunk("x")).await;
                    let _ = sock.flush().await;
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
            Scenario::Models => {
                let _ = sock
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"data\":[{\"id\":\"deepseek-chat\"},{\"id\":\"deepseek-reasoner\"}]}",
                    )
                    .await;
            }
        }
    });
    addr
}

/// 读到请求头（和 body，按 Content-Length）
async fn read_request(sock: &mut TcpStream) -> (String, Vec<u8>) {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    let mut head_end = 0usize;
    loop {
        let n = sock.read(&mut tmp).await.unwrap_or(0);
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = find_seq(&buf, b"\r\n\r\n") {
            head_end = pos + 4;
            break;
        }
    }
    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
    let content_len = head
        .lines()
        .find(|l| l.to_lowercase().starts_with("content-length:"))
        .and_then(|l| l.split(':').nth(1))
        .and_then(|v| v.trim().parse::<usize>().ok())
        .unwrap_or(0);
    while buf.len() < head_end + content_len {
        let n = sock.read(&mut tmp).await.unwrap_or(0);
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
    }
    (head, buf[head_end..].to_vec())
}

fn find_seq(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn cfg_for(addr: &str) -> StreamConfig {
    StreamConfig {
        url: format!("http://{addr}/v1/chat/completions"),
        api_key: "sk-test".into(),
        body: json!({"model": "test-model", "stream": true}),
    }
}

#[tokio::test]
async fn stream_success_full_text_and_auth() {
    let (auth_tx, auth_rx) = oneshot::channel();
    let addr = serve_one(Scenario::Success, Some(auth_tx), None).await;

    let mut chunks: Vec<String> = Vec::new();
    let result = stream_chat(&cfg_for(&addr), None, |d| chunks.push(d.to_string())).await;

    assert!(result.error.is_none(), "error: {:?}", result.error);
    assert!(!result.cancelled);
    assert_eq!(result.text, format!("{DELTA1}{DELTA2}"));
    assert_eq!(chunks, vec![DELTA1.to_string(), DELTA2.to_string()]);

    let auth = auth_rx.await.unwrap();
    // reqwest 在线上会把 header 名小写化
    assert_eq!(auth.to_lowercase(), "authorization: bearer sk-test");
}

#[tokio::test]
async fn no_auth_header_when_key_empty() {
    let (auth_tx, auth_rx) = oneshot::channel();
    let addr = serve_one(Scenario::Success, Some(auth_tx), None).await;
    let mut cfg = cfg_for(&addr);
    cfg.api_key = String::new();

    let result = stream_chat(&cfg, None, |_| {}).await;
    assert!(result.error.is_none());
    let auth = auth_rx.await.unwrap();
    assert!(auth.is_empty(), "空 key 不应发送 Authorization: {auth}");
}

#[tokio::test]
async fn stream_http_401_error() {
    let addr = serve_one(Scenario::Http401, None, None).await;
    let result = stream_chat(&cfg_for(&addr), None, |_| {}).await;
    let err = result.error.unwrap();
    assert!(err.contains("HTTP 401"), "err: {err}");
    assert!(err.contains("invalid api key"));
}

#[tokio::test]
async fn stream_midstream_close_keeps_partial() {
    let addr = serve_one(Scenario::MidStreamClose, None, None).await;
    let result = stream_chat(&cfg_for(&addr), None, |_| {}).await;
    assert!(result.error.is_some(), "断流应报错");
    assert!(
        result.text.starts_with("你好"),
        "部分文本应保留: {:?}",
        result.text
    );
}

#[tokio::test]
async fn stream_cancel_keeps_partial() {
    let addr = serve_one(Scenario::SlowStream, None, None).await;
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let (chunk_tx, mut chunk_rx) = tokio::sync::mpsc::channel(8);

    let task = tokio::spawn({
        let cfg = cfg_for(&addr);
        async move {
            stream_chat(&cfg, Some(cancel_rx), |d| {
                let _ = chunk_tx.try_send(d.to_string());
            })
            .await
        }
    });

    // 等收到第一个 chunk 后取消
    let first = chunk_rx.recv().await.expect("应至少收到一个 chunk");
    cancel_tx.send(()).unwrap();
    let result = task.await.unwrap();

    assert!(result.cancelled);
    assert!(
        result.text.starts_with(&first),
        "取消后应保留已收到的部分: {:?}",
        result.text
    );
}

#[tokio::test]
async fn stream_rejects_bad_url() {
    let cfg = StreamConfig {
        url: "http://127.0.0.1:1/v1/chat/completions".into(), // 立即拒绝的端口
        api_key: String::new(),
        body: json!({}),
    };
    let result = stream_chat(&cfg, None, |_| {}).await;
    assert!(result.error.is_some());
    assert!(result.text.is_empty());
}

#[tokio::test]
async fn fetch_models_from_upstream() {
    let (line_tx, line_rx) = oneshot::channel();
    let addr = serve_one(Scenario::Models, None, Some(line_tx)).await;

    let models = brochat_lib::llm::client::fetch_models(&format!("http://{addr}/v1"), "sk").await;
    assert_eq!(
        models.unwrap(),
        vec!["deepseek-chat".to_string(), "deepseek-reasoner".to_string()]
    );

    // 请求路径应为 /v1/models
    let line = line_rx.await.unwrap();
    assert!(line.starts_with("GET /v1/models"), "request line: {line}");
}

#[tokio::test]
async fn fetch_models_error_path() {
    let addr = serve_one(Scenario::Http401, None, None).await;
    let err = brochat_lib::llm::client::fetch_models(&format!("http://{addr}/v1"), "bad").await;
    let err = err.unwrap_err();
    assert!(err.contains("HTTP 401"), "err: {err}");
}
