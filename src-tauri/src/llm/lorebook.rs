//! 世界书注入：条目激活（常驻/关键词/selective）→ 排序 → 预算截断 → 分组。
//! 纯函数，逻辑可直接单元测试。

use crate::llm::context::estimate_tokens;
use crate::models::LoreEntry;

/// 注入结果：按注入位置分组（ST: before_char / after_char）
#[derive(Debug, Default, Clone)]
pub struct LoreInjection {
    pub before_char: Vec<String>,
    pub after_char: Vec<String>,
}

impl LoreInjection {
    pub fn is_empty(&self) -> bool {
        self.before_char.is_empty() && self.after_char.is_empty()
    }
}

/// 从历史消息里截出扫描文本（最近 scan_depth 条）
pub fn scan_text_from(history: &[crate::models::Message], scan_depth: usize) -> String {
    history
        .iter()
        .rev()
        .take(scan_depth)
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// 条目激活与注入：
/// - 常驻（constant）无条件参与
/// - 关键词条目：scan_text 中出现任一主关键词即激活；selective 条目还需副关键词命中
/// - 按 insertion_order 升序逐条注入，预算用尽即停止（ST 行为）
pub fn build_lore_injection(
    entries: &[LoreEntry],
    scan_text: &str,
    token_budget: usize,
) -> LoreInjection {
    let lower_scan = scan_text.to_lowercase();
    let mut activated: Vec<(&LoreEntry, usize)> = Vec::new();

    for e in entries {
        if !e.enabled || e.content.trim().is_empty() {
            continue;
        }
        let hit = |keys: &[String]| {
            keys.iter().any(|k| {
                let k = k.trim().to_lowercase();
                !k.is_empty() && lower_scan.contains(&k)
            })
        };
        let active = if e.constant {
            true
        } else if e.selective {
            hit(&e.keys) && hit(&e.secondary_keys)
        } else {
            hit(&e.keys)
        };
        if active {
            // 每条内容估算 + 标题/格式开销
            activated.push((e, estimate_tokens(&e.content) + 8));
        }
    }

    activated.sort_by_key(|(e, _)| e.insertion_order);

    let mut out = LoreInjection::default();
    let mut used = 0usize;
    for (e, cost) in activated {
        if used + cost > token_budget {
            break; // 顺序靠前的优先，预算耗尽即停（ST 行为）
        }
        used += cost;
        match e.position.as_str() {
            "after_char" => out.after_char.push(e.content.clone()),
            _ => out.before_char.push(e.content.clone()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LoreEntry;

    fn entry(
        keys: &[&str],
        content: &str,
        constant: bool,
        order: i64,
    ) -> LoreEntry {
        LoreEntry {
            id: String::new(),
            keys: keys.iter().map(|s| s.to_string()).collect(),
            secondary_keys: vec![],
            comment: String::new(),
            content: content.to_string(),
            constant,
            selective: false,
            insertion_order: order,
            enabled: true,
            position: "before_char".into(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn constant_always_injected() {
        let e = entry(&[], "常驻条目", true, 0);
        let out = build_lore_injection(&[e], "", 1000);
        assert_eq!(out.before_char, vec!["常驻条目"]);
    }

    #[test]
    fn keyword_activation() {
        let e = entry(&["咖啡馆", "咖啡"], "咖啡相关的设定", false, 0);
        // 命中
        let out = build_lore_injection(&[e.clone()], "我们去咖啡馆吧", 1000);
        assert_eq!(out.before_char, vec!["咖啡相关的设定"]);
        // 未命中
        let out = build_lore_injection(&[e], "我们去公园吧", 1000);
        assert!(out.is_empty());
    }

    #[test]
    fn disabled_and_empty_skipped() {
        let mut e = entry(&["x"], "内容", false, 0);
        e.enabled = false;
        let out = build_lore_injection(&[e], "x", 1000);
        assert!(out.is_empty());

        let e = entry(&["x"], "   ", false, 0);
        let out = build_lore_injection(&[e], "x", 1000);
        assert!(out.is_empty());
    }

    #[test]
    fn selective_needs_secondary_key() {
        let mut e = entry(&["林晓"], "林晓的店", false, 0);
        e.selective = true;
        e.secondary_keys = vec!["吧台".into()];
        // 只有主关键词 → 不激活
        let out = build_lore_injection(&[e.clone()], "林晓在吗", 1000);
        assert!(out.is_empty());
        // 主+副 → 激活
        let out = build_lore_injection(&[e], "林晓在吧台后面", 1000);
        assert_eq!(out.before_char, vec!["林晓的店"]);
    }

    #[test]
    fn budget_stops_by_insertion_order() {
        // 预算 40：第一条 30 能进，第二条 30 超预算 → 只注入第一条
        let e1 = entry(&["a"], &"甲".repeat(26), false, 0); // 26+8=34
        let e2 = entry(&["b"], &"乙".repeat(26), false, 1);
        let out = build_lore_injection(&[e1, e2], "a b", 40);
        assert_eq!(out.before_char.len(), 1);
        assert!(out.before_char[0].starts_with("甲"));
    }

    #[test]
    fn insertion_order_sorting() {
        let e1 = entry(&["a"], "第一", false, 5);
        let e2 = entry(&["b"], "第二", false, 1);
        let out = build_lore_injection(&[e1, e2], "a b", 1000);
        assert_eq!(out.before_char, vec!["第二", "第一"]);
    }

    #[test]
    fn position_grouping() {
        let mut e1 = entry(&["a"], "前部条目", false, 0);
        e1.position = "before_char".into();
        let mut e2 = entry(&["b"], "后部条目", false, 1);
        e2.position = "after_char".into();
        let out = build_lore_injection(&[e1, e2], "a b", 1000);
        assert_eq!(out.before_char, vec!["前部条目"]);
        assert_eq!(out.after_char, vec!["后部条目"]);
    }

    #[test]
    fn scan_text_takes_last_n() {
        let msgs = vec![
            crate::models::Message {
                id: "1".into(),
                conversation_id: "c".into(),
                role: "user".into(),
                content: "第一条".into(),
                seq: 1,
                created_at: String::new(),
            },
            crate::models::Message {
                id: "2".into(),
                conversation_id: "c".into(),
                role: "assistant".into(),
                content: "第二条".into(),
                seq: 2,
                created_at: String::new(),
            },
            crate::models::Message {
                id: "3".into(),
                conversation_id: "c".into(),
                role: "user".into(),
                content: "第三条".into(),
                seq: 3,
                created_at: String::new(),
            },
        ];
        let text = scan_text_from(&msgs, 2);
        assert!(text.contains("第二条"));
        assert!(text.contains("第三条"));
        assert!(!text.contains("第一条"));
    }
}
