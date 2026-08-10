//! OpenAI 兼容请求构造：base_url 规范化、请求体组装、上下文组装。

use serde_json::json;

use crate::llm::context::{Msg, substitute_tokens};
use crate::llm::lorebook::LoreInjection;
use crate::models::{Character, Message, Settings};

/// base_url 规范化，自动识别并补齐后缀：
/// - 已以 /chat/completions 结尾 → 原样使用（上游给了完整路径）
/// - 以 /v1 结尾 → 直接拼 /chat/completions
/// - 其他（裸域名/带 /api 等）→ 补 /v1 再拼
/// Ollama 默认 http://localhost:11434/v1 也走这里。
pub fn chat_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        return base.to_string();
    }
    let mut b = base.to_string();
    if !b.ends_with("/v1") {
        b.push_str("/v1");
    }
    format!("{b}/chat/completions")
}

/// 模型列表接口地址（与 chat_url 同一规范化基准）。
/// 上游给了完整 chat/completions 路径 → 同级替换为 /models（不插 /v1）。
pub fn models_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if let Some(stripped) = base.strip_suffix("/chat/completions") {
        return format!("{}/models", stripped.trim_end_matches('/'));
    }
    let mut b = base.to_string();
    if !b.ends_with("/v1") {
        b.push_str("/v1");
    }
    format!("{b}/models")
}

/// 部分新模型不接受 max_tokens，需要 max_completion_tokens（gpt-5/o1/o3/o4 系）
fn prefer_max_completion_tokens(model: &str) -> bool {
    let m = model.to_lowercase();
    ["gpt-5", "o1", "o3", "o4"].iter().any(|p| m.starts_with(p))
}

/// 组装发给模型的消息数组：
/// - system：角色自定义提示词（或全局默认）+ 世界书注入 + 描述/性格/场景/示例对话块
/// - 历史：DB 里的全部消息，经 trim_history 裁剪（含刚插入的最新 user 消息）
/// - 全部内容做 {{user}}/{{char}} 令牌替换
pub fn build_request_messages(
    character: &Character,
    settings: &Settings,
    history: &[Message],
    lore: &LoreInjection,
) -> Vec<Msg> {
    let mut system_parts: Vec<String> = Vec::new();
    let base = character
        .system_prompt
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(settings.system_prompt.as_str());
    if !base.trim().is_empty() {
        system_parts.push(base.trim().to_string());
    }
    // 世界书：before_char 条目插在角色设定前
    for text in &lore.before_char {
        system_parts.push(format!("【世界设定】\n{text}"));
    }
    if !character.description.trim().is_empty() {
        system_parts.push(format!("【角色设定·描述】\n{}", character.description.trim()));
    }
    if !character.personality.trim().is_empty() {
        system_parts.push(format!("【角色设定·性格】\n{}", character.personality.trim()));
    }
    if !character.scenario.trim().is_empty() {
        system_parts.push(format!("【角色设定·场景】\n{}", character.scenario.trim()));
    }
    // 世界书：after_char 条目插在角色设定后、示例对话前
    for text in &lore.after_char {
        system_parts.push(format!("【世界设定】\n{text}"));
    }
    if !character.example_messages.trim().is_empty() {
        system_parts.push(format!("【示例对话】\n{}", character.example_messages.trim()));
    }

    let history_msgs: Vec<Msg> = history
        .iter()
        .map(|m| Msg::new(m.role.clone(), m.content.clone()))
        .collect();
    let trimmed = super::context::trim_history(&history_msgs, settings.max_context_tokens as usize);

    let mut out: Vec<Msg> = Vec::with_capacity(trimmed.len() + 1);
    if !system_parts.is_empty() {
        let system_text = substitute_tokens(&system_parts.join("\n\n"), &character.name);
        out.push(Msg::new("system", system_text));
    }
    for m in trimmed {
        // 设置可关闭 assistant 消息里的令牌替换（部分模型会用原文生成）
        let content = if m.role == "assistant" && !settings.chat_substitute_in_assistant {
            m.content.clone()
        } else {
            substitute_tokens(&m.content, &character.name)
        };
        out.push(Msg::new(m.role, content));
    }
    out
}

/// 组装流式请求体（不含 Authorization，由调用方加）
pub fn build_body(settings: &Settings, messages: &[Msg]) -> serde_json::Value {
    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| json!({"role": m.role, "content": m.content}))
        .collect();
    let mut body = json!({
        "model": settings.model,
        "messages": msgs,
        "stream": true,
        "temperature": settings.temperature,
    });
    if prefer_max_completion_tokens(&settings.model) {
        body["max_completion_tokens"] = json!(settings.max_tokens);
    } else {
        body["max_tokens"] = json!(settings.max_tokens);
    }
    body
}

/// 拉取上游模型列表（OpenAI 兼容 GET /v1/models）
pub async fn fetch_models(base_url: &str, api_key: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .read_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let mut req = client.get(models_url(base_url));
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }
    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let text = if text.chars().count() > 200 {
            text.chars().take(200).collect::<String>() + "…"
        } else {
            text
        };
        return Err(format!("HTTP {status}: {text}"));
    }
    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("响应解析失败: {e}"))?;
    let ids: Vec<String> = v["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Err("上游未返回模型列表（可手动输入模型名）".into());
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::CharacterInput;

    #[test]
    fn url_normalization() {
        assert_eq!(
            chat_url("https://api.deepseek.com"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            chat_url("https://api.deepseek.com/v1/"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            chat_url("http://localhost:11434/v1"),
            "http://localhost:11434/v1/chat/completions"
        );
        // 上游给了完整路径 → 原样使用，不重复拼
        assert_eq!(
            chat_url("https://api.deepseek.com/v1/chat/completions"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            chat_url("https://proxy.example.com/api/chat/completions/"),
            "https://proxy.example.com/api/chat/completions"
        );
    }

    #[test]
    fn models_url_normalization() {
        assert_eq!(
            models_url("https://api.deepseek.com"),
            "https://api.deepseek.com/v1/models"
        );
        assert_eq!(
            models_url("https://api.deepseek.com/v1"),
            "https://api.deepseek.com/v1/models"
        );
        // 完整 chat/completions 路径 → 替换为 models
        assert_eq!(
            models_url("https://proxy.example.com/api/chat/completions"),
            "https://proxy.example.com/api/models"
        );
        assert_eq!(
            models_url("http://localhost:11434/v1"),
            "http://localhost:11434/v1/models"
        );
    }

    #[test]
    fn body_uses_max_tokens_for_common_models() {
        let s = Settings {
            model: "deepseek-chat".into(),
            ..Default::default()
        };
        let body = build_body(&s, &[]);
        assert!(body.get("max_tokens").is_some());
        assert!(body.get("max_completion_tokens").is_none());
    }

    #[test]
    fn body_uses_max_completion_tokens_for_new_openai_models() {
        let s = Settings {
            model: "gpt-5-mini".into(),
            ..Default::default()
        };
        let body = build_body(&s, &[]);
        assert!(body.get("max_completion_tokens").is_some());
        assert!(body.get("max_tokens").is_none());

        let s = Settings {
            model: "o4-mini".into(),
            ..Default::default()
        };
        let body = build_body(&s, &[]);
        assert!(body.get("max_completion_tokens").is_some());
    }

    #[test]
    fn request_messages_include_system_and_substitute_tokens() {
        let conn = db::init_conn_memory().unwrap();
        let input = CharacterInput {
            name: "林晓".into(),
            description: "毒舌".into(),
            personality: "冷静".into(),
            scenario: "咖啡馆".into(),
            first_messages: vec![],
            example_messages: "{{char}}：示例对话".into(),
            system_prompt: None,
            tags: vec![],
            nsfw: false,
            avatar: None,
            extensions: None,
        };
        let c = db::characters::create(&conn, &input).unwrap();
        let history = vec![
            crate::models::Message {
                id: "1".into(),
                conversation_id: "c".into(),
                role: "assistant".into(),
                content: "{{char}}：欢迎光临".into(),
                seq: 1,
                created_at: "".into(),
            },
            crate::models::Message {
                id: "2".into(),
                conversation_id: "c".into(),
                role: "user".into(),
                content: "{{user}}：你好".into(),
                seq: 2,
                created_at: "".into(),
            },
        ];
        let s = Settings::default();
        let msgs = build_request_messages(&c, &s, &history, &super::super::lorebook::LoreInjection::default());
        assert_eq!(msgs[0].role, "system");
        let sys = &msgs[0].content;
        assert!(sys.contains("林晓：示例对话"), "示例对话应替换 {{char}}");
        assert!(sys.contains("毒舌"));
        assert!(msgs.iter().any(|m| m.content == "林晓：欢迎光临"));
        assert!(msgs.iter().any(|m| m.content == "用户：你好"));
    }
}
