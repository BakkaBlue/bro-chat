//! 上下文组装：token 估算（CJK 感知）、{{user}}/{{char}} 令牌替换、
//! 历史消息裁剪（按 (user, assistant) 对从最旧丢弃，最新 user 永不丢）。

#[derive(Debug, Clone)]
pub struct Msg {
    pub role: String,
    pub content: String,
}

impl Msg {
    pub fn new(role: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            content: content.into(),
        }
    }
}

/// CJK 感知的 token 估算：CJK 字符 1 字符 ≈ 1 token，其他 ≈ 4 字符 1 token。
pub fn estimate_tokens(text: &str) -> usize {
    let (mut cjk, mut other) = (0usize, 0usize);
    for c in text.chars() {
        if is_cjk(c) {
            cjk += 1;
        } else {
            other += 1;
        }
    }
    cjk + (other + 3) / 4
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3400..=0x4DBF   // 扩展 A
        | 0x4E00..=0x9FFF // 基本区
        | 0x20000..=0x2A6DF // 扩展 B
        | 0x3040..=0x30FF // 平假名/片假名
        | 0xAC00..=0xD7AF // 谚文
        | 0x3000..=0x303F // CJK 标点
        | 0xFF00..=0xFFEF // 全角字符
    )
}

/// 替换卡片/消息里的 {{char}} / {{user}} 令牌
pub fn substitute_tokens(text: &str, char_name: &str) -> String {
    text.replace("{{char}}", char_name).replace("{{user}}", "用户")
}

/// 从最旧开始按两条一组丢弃（避免残留单边 assistant），直到估算 token
/// 数在预算内；仍超预算时再单独丢孤立的 assistant（其 user 已被丢）。
/// 最新一条消息永不丢（允许轻微超预算，文档化的取舍）。
/// 系统提示词由调用方单独传入，不经过此函数。
pub fn trim_history(messages: &[Msg], max_context_tokens: usize) -> Vec<Msg> {
    if messages.is_empty() {
        return vec![];
    }
    let costs: Vec<usize> = messages
        .iter()
        .map(|m| estimate_tokens(&m.content) + 4)
        .collect();
    let mut cost: usize = costs.iter().sum();

    // 预算 0：只保留最新一条（最新 user 永不丢）
    if max_context_tokens == 0 {
        return vec![messages.last().unwrap().clone()];
    }

    let mut start = 0usize;
    // 成对丢弃，保证剩余至少一条
    while start + 2 < messages.len() && cost > max_context_tokens {
        cost -= costs[start] + costs[start + 1];
        start += 2;
    }
    // 仍超预算：再丢孤立的一条（其配对消息已丢）
    while start + 1 < messages.len() && cost > max_context_tokens {
        cost -= costs[start];
        start += 1;
    }
    messages[start..].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> Msg {
        Msg::new(role, content)
    }

    #[test]
    fn cjk_tokens_heavier_than_ascii() {
        // 8 个汉字 = 8 tokens
        assert_eq!(estimate_tokens("你好世界你好世界"), 8);
        // 32 个 ASCII = 8 tokens
        assert_eq!(estimate_tokens("abcdefghijklmnopqrstuvwxyz123456"), 8);
        // 混合："你好" 2 汉字 + " world" 6 字符 → 2 + ceil(6/4) = 4
        assert_eq!(estimate_tokens("你好 world"), 4);
    }

    #[test]
    fn substitute_both_tokens() {
        let text = "{{char}}：你好 {{user}}，我是{{char}}";
        assert_eq!(substitute_tokens(text, "林晓"), "林晓：你好 用户，我是林晓");
    }

    #[test]
    fn trim_keeps_short_history() {
        let msgs = vec![msg("assistant", "嗨"), msg("user", "你好")];
        let out = trim_history(&msgs, 8192);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn trim_drops_pairs_from_front() {
        // 每条 ~10 tokens，预算 30 → 应丢最旧一对，保留后 2 条
        let msgs = vec![
            msg("user", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            msg("assistant", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
            msg("user", "cccccccccccccccccccccccccccccccc"),
            msg("assistant", "dddddddddddddddddddddddddddddddd"),
        ];
        let out = trim_history(&msgs, 30);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].content, "cccccccccccccccccccccccccccccccc");
        assert_eq!(out[1].content, "dddddddddddddddddddddddddddddddd");
    }

    #[test]
    fn trim_never_drops_newest_user() {
        // 预算极小：只剩最新 user
        let msgs = vec![
            msg("assistant", "开场白"),
            msg("user", "第一条"),
            msg("assistant", "回复一"),
            msg("user", "最新的一条消息"),
        ];
        let out = trim_history(&msgs, 2);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "最新的一条消息");
    }

    #[test]
    fn trim_zero_budget() {
        let msgs = vec![msg("assistant", "开场白"), msg("user", "你好")];
        let out = trim_history(&msgs, 0);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "你好");

        // 单条消息也不崩
        let out = trim_history(&[msg("assistant", "只有我")], 0);
        assert_eq!(out.len(), 1);

        // 空列表
        let out = trim_history(&[], 0);
        assert!(out.is_empty());
    }

    #[test]
    fn trim_greeting_first_works() {
        // 开场白是 assistant 开头（ST 惯例），成对丢弃依然成立
        let msgs = vec![
            msg("assistant", "欢迎光临"),
            msg("user", "来杯咖啡"),
            msg("assistant", "好的"),
            msg("user", "谢谢"),
        ];
        // 预算 10：丢 (欢迎光临,来杯咖啡) 后仍超预算 → 再丢孤立的「好的」→ 只剩「谢谢」
        let out = trim_history(&msgs, 10);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "谢谢");
        // 预算 20：丢一对后预算内 → 剩「好的, 谢谢」
        let out = trim_history(&msgs, 20);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].content, "好的");
        assert_eq!(out[1].content, "谢谢");
    }
}
