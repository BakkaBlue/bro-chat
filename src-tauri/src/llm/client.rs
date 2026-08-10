//! OpenAI 兼容请求构造：base_url 规范化、请求体组装、上下文组装。

use serde_json::json;

use crate::llm::context::{Msg, substitute_tokens};
use crate::models::{Character, Message, Settings};

/// base_url 规范化：去尾斜杠，无 /v1 则补上，最终指向 chat/completions。
/// Ollama 默认 http://localhost:11434/v1 也走这里。
pub fn chat_url(base_url: &str) -> String {
    let mut base = base_url.trim().trim_end_matches('/').to_string();
    if !base.ends_with("/v1") {
        base.push_str("/v1");
    }
    format!("{base}/chat/completions")
}

/// 部分新模型不接受 max_tokens，需要 max_completion_tokens（gpt-5/o1/o3/o4 系）
fn prefer_max_completion_tokens(model: &str) -> bool {
    let m = model.to_lowercase();
    ["gpt-5", "o1", "o3", "o4"].iter().any(|p| m.starts_with(p))
}

/// 组装发给模型的消息数组：
/// - system：角色自定义提示词（或全局默认）+ 描述/性格/场景/示例对话块
/// - 历史：DB 里的全部消息，经 trim_history 裁剪（含刚插入的最新 user 消息）
/// - 全部内容做 {{user}}/{{char}} 令牌替换
pub fn build_request_messages(
    character: &Character,
    settings: &Settings,
    history: &[Message],
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
    if !character.description.trim().is_empty() {
        system_parts.push(format!("【角色设定·描述】\n{}", character.description.trim()));
    }
    if !character.personality.trim().is_empty() {
        system_parts.push(format!("【角色设定·性格】\n{}", character.personality.trim()));
    }
    if !character.scenario.trim().is_empty() {
        system_parts.push(format!("【角色设定·场景】\n{}", character.scenario.trim()));
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
        let content = substitute_tokens(&m.content, &character.name);
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
        let msgs = build_request_messages(&c, &s, &history);
        assert_eq!(msgs[0].role, "system");
        let sys = &msgs[0].content;
        assert!(sys.contains("林晓：示例对话"), "示例对话应替换 {{char}}");
        assert!(sys.contains("毒舌"));
        assert!(msgs.iter().any(|m| m.content == "林晓：欢迎光临"));
        assert!(msgs.iter().any(|m| m.content == "用户：你好"));
    }
}
