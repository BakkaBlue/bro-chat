//! 手写 SSE 解析器：只认 `data:` 行，空行触发事件，容忍跨 chunk 断行、
//! CRLF、多行 JSON、注释行（`: keepalive`）。流结束时用 finish() 冲刷。

/// 单条事件负载上限：超过即丢弃缓冲（防故障/恶意上游撑爆内存）
const MAX_EVENT_BYTES: usize = 256 * 1024;

pub struct SseParser {
    buf: Vec<u8>,
    data_lines: Vec<String>,
}

impl Default for SseParser {
    fn default() -> Self {
        Self::new()
    }
}

impl SseParser {
    pub fn new() -> Self {
        Self {
            buf: Vec::with_capacity(1024),
            data_lines: Vec::new(),
        }
    }

    /// 推送字节，返回本次解析出的完整事件负载（每条是 data 行拼接的结果）
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        // 单事件超限（含已累积的 data 行）：丢弃缓冲，防止内存无限增长
        let pending: usize = self.buf.len()
            + self.data_lines.iter().map(|s| s.len() + 2).sum::<usize>();
        if pending + bytes.len() > MAX_EVENT_BYTES {
            self.buf.clear();
            self.data_lines.clear();
            return Vec::new();
        }
        self.buf.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some(nl) = self.buf.iter().position(|&b| b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=nl).collect();
            line.pop(); // 去掉 \n
            if line.ends_with(b"\r") {
                line.pop();
            }
            let line = String::from_utf8_lossy(&line).into_owned();
            self.feed_line(&line, &mut events);
        }
        events
    }

    /// 流结束：处理缓冲区残留（可能没有最后的空行）
    pub fn finish(&mut self) -> Vec<String> {
        let mut events = Vec::new();
        if !self.buf.is_empty() {
            let line = String::from_utf8_lossy(&self.buf).into_owned();
            self.buf.clear();
            self.feed_line(&line, &mut events);
        }
        if !self.data_lines.is_empty() {
            events.push(self.data_lines.join("\n"));
            self.data_lines.clear();
        }
        events
    }

    fn feed_line(&mut self, line: &str, events: &mut Vec<String>) {
        if line.is_empty() {
            // 空行 = 事件结束
            if !self.data_lines.is_empty() {
                events.push(self.data_lines.join("\n"));
                self.data_lines.clear();
            }
            return;
        }
        if let Some(data) = line.strip_prefix("data:") {
            // 按 SSE 规范剥掉一个前导空格
            let data = data.strip_prefix(' ').unwrap_or(data);
            self.data_lines.push(data.to_string());
        }
        // event:/id:/冒号注释行等其他行一律忽略
    }
}

/// 从事件负载中提取 choices[0].delta.content（role 专属块与 finish_reason 块为空）
pub fn extract_delta(payload: &str) -> Option<String> {
    if payload == "[DONE]" {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    v["choices"]
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_event() {
        let mut p = SseParser::new();
        let ev = p.push(b"data: {\"a\":1}\n\n");
        assert_eq!(ev, vec![r#"{"a":1}"#]);
    }

    #[test]
    fn chunk_split_mid_line() {
        let mut p = SseParser::new();
        assert!(p.push(b"data: {\"a").is_empty());
        assert!(p.push(b"\":1}\n").is_empty());
        let ev = p.push(b"\n");
        assert_eq!(ev, vec![r#"{"a":1}"#]);
    }

    #[test]
    fn crlf_handled() {
        let mut p = SseParser::new();
        let ev = p.push(b"data: hello\r\n\r\n");
        assert_eq!(ev, vec!["hello"]);
    }

    #[test]
    fn ignores_comments_and_other_fields() {
        let mut p = SseParser::new();
        let ev = p.push(b": keepalive\nid: 1\nevent: message\ndata: hi\n\n");
        assert_eq!(ev, vec!["hi"]);
    }

    #[test]
    fn multi_line_data_joined() {
        let mut p = SseParser::new();
        let ev = p.push(b"data: {\"a\":\ndata: 1}\n\n");
        assert_eq!(ev, vec![r#"{"a":
1}"#]);
    }

    #[test]
    fn multiple_events_in_one_push() {
        let mut p = SseParser::new();
        let ev = p.push(b"data: one\n\ndata: two\n\n");
        assert_eq!(ev, vec!["one", "two"]);
    }

    #[test]
    fn done_sentinel() {
        let mut p = SseParser::new();
        let ev = p.push(b"data: [DONE]\n\n");
        assert_eq!(ev, vec!["[DONE]"]);
    }

    #[test]
    fn garbage_bytes_tolerated() {
        let mut p = SseParser::new();
        let ev = p.push(b"\x00\xffgarbage\n\n");
        assert!(ev.is_empty() || ev.len() == 1);
    }

    #[test]
    fn finish_flushes_without_blank_line() {
        let mut p = SseParser::new();
        assert!(p.push(b"data: tail").is_empty());
        let ev = p.finish();
        assert_eq!(ev, vec!["tail"]);
    }

    #[test]
    fn empty_delta_from_role_chunk() {
        let payload = r#"{"choices":[{"delta":{"role":"assistant"}}]}"#;
        assert_eq!(extract_delta(payload), None);
        let payload = r#"{"choices":[{"delta":{"content":"你好"}}]}"#;
        assert_eq!(extract_delta(payload), Some("你好".to_string()));
        let payload = r#"{"choices":[{"finish_reason":"stop"}]}"#;
        assert_eq!(extract_delta(payload), None);
        assert_eq!(extract_delta("[DONE]"), None);
        assert_eq!(extract_delta("not json"), None);
    }
}
