// Stage 4: 长对话上下文管理集成测试
use brochat_lib::db::{self, characters, conversations, messages};
use brochat_lib::llm::client::build_request_messages;
use brochat_lib::llm::context::estimate_tokens;
use brochat_lib::models::{CharacterInput, Settings};

fn setup() -> rusqlite::Connection {
    db::init_conn_memory().unwrap()
}

fn char_input() -> CharacterInput {
    CharacterInput {
        name: "长对话测试".into(),
        description: "测试描述".into(),
        personality: "耐心".into(),
        scenario: "会议室".into(),
        first_messages: vec![],
        example_messages: String::new(),
        system_prompt: Some("你是会议记录助手".into()),
        tags: vec![],
        nsfw: false,
        avatar: None,
        extensions: None,
    }
}

#[test]
fn three_hundred_messages_stay_within_budget() {
    let conn = setup();
    let c = characters::create(&conn, &char_input()).unwrap();
    let conv = conversations::create(&conn, &c.id).unwrap();

    // 150 轮完整对话（300 条）+ 最后一条用户消息（模拟 send_message 的真实流程）
    for i in 0..150 {
        messages::insert(&conn, &conv.id, "user", &format!("这是第 {i} 轮的用户问题，内容带有一些上下文信息以便模拟真实对话长度。"))
            .unwrap();
        messages::insert(&conn, &conv.id, "assistant", &format!("这是第 {i} 轮的助手回复，内容同样带有一定的长度来模拟真实流式回复的场景。"))
            .unwrap();
    }
    messages::insert(&conn, &conv.id, "user", "第 150 轮，这是最新的一条用户消息。").unwrap();
    let history = messages::list(&conn, &conv.id).unwrap();
    assert_eq!(history.len(), 301);

    // 小预算：800 tokens
    let s = Settings {
        max_context_tokens: 800,
        ..Default::default()
    };
    let msgs = build_request_messages(&c, &s, &history);

    // 系统提示词始终在
    assert!(msgs.iter().any(|m| m.role == "system"));
    let sys = msgs.iter().find(|m| m.role == "system").unwrap();
    assert!(sys.content.contains("会议记录助手"));
    assert!(sys.content.contains("测试描述"));

    // 最新用户消息永不丢
    let last = msgs.last().unwrap();
    assert_eq!(last.role, "user");
    assert!(last.content.contains("最新的一条用户消息"), "最新消息应保留: {}", last.content);

    // 消息条数被大幅裁剪
    assert!(msgs.len() < 300, "应裁剪旧消息: {}", msgs.len());

    // 历史总量在预算内（系统提示词不占预算，最新 user 允许轻微超）
    let history_cost: usize = msgs
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| estimate_tokens(&m.content) + 4)
        .sum();
    let last_cost = estimate_tokens(&last.content) + 4;
    assert!(
        history_cost <= 800 + last_cost,
        "历史 {history_cost} 超出预算 800 + 最新消息 {last_cost}"
    );
}

#[test]
fn big_budget_keeps_everything() {
    let conn = setup();
    let c = characters::create(&conn, &char_input()).unwrap();
    let conv = conversations::create(&conn, &c.id).unwrap();
    for i in 0..150 {
        messages::insert(&conn, &conv.id, "user", &format!("问题 {i}")).unwrap();
        messages::insert(&conn, &conv.id, "assistant", &format!("回答 {i}")).unwrap();
    }
    let history = messages::list(&conn, &conv.id).unwrap();
    let s = Settings {
        max_context_tokens: 10_000_000,
        ..Default::default()
    };
    let msgs = build_request_messages(&c, &s, &history);
    // system + 300 条历史
    assert_eq!(msgs.len(), 301);
}

#[test]
fn empty_history_only_system() {
    let conn = setup();
    let c = characters::create(&conn, &char_input()).unwrap();
    let conv = conversations::create(&conn, &c.id).unwrap();
    let history = messages::list(&conn, &conv.id).unwrap();
    let s = Settings::default();
    let msgs = build_request_messages(&c, &s, &history);
    // 无消息时只有 system（角色有自定义提示词）
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].role, "system");
}

#[test]
fn zero_budget_keeps_newest_user_only() {
    let conn = setup();
    let c = characters::create(&conn, &char_input()).unwrap();
    let conv = conversations::create(&conn, &c.id).unwrap();
    messages::insert(&conn, &conv.id, "user", "旧问题").unwrap();
    messages::insert(&conn, &conv.id, "assistant", "旧回答").unwrap();
    messages::insert(&conn, &conv.id, "user", "新问题").unwrap();
    let history = messages::list(&conn, &conv.id).unwrap();
    let s = Settings {
        max_context_tokens: 0,
        ..Default::default()
    };
    let msgs = build_request_messages(&c, &s, &history);
    assert_eq!(msgs.len(), 2); // system + 最新 user
    assert_eq!(msgs[1].content, "新问题");
}
