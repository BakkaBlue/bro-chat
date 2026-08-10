// Stage 1: 数据层集成测试
use brochat_lib::db::{self, characters, conversations, messages, settings};
use brochat_lib::models::{CharacterInput, Settings};
use rusqlite::Connection;
use tempfile::TempDir;

struct TestDb {
    _dir: TempDir,
    conn: Connection,
}

fn test_db() -> TestDb {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("test.db");
    let conn = db::init_conn(&path).unwrap();
    TestDb { _dir: dir, conn }
}

fn sample_input(name: &str) -> CharacterInput {
    CharacterInput {
        name: name.into(),
        description: "一段描述".into(),
        personality: "活泼".into(),
        scenario: "咖啡馆".into(),
        first_messages: vec!["你好，{{user}}！".into()],
        example_messages: "{{char}}：示例".into(),
        system_prompt: Some("自定义系统提示".into()),
        tags: vec!["test".into(), "中文".into()],
        nsfw: true,
        avatar: Some(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                .into(),
        ),
        extensions: Some(serde_json::json!({"world": {"book": {"name": "w1"}}})),
    }
}

#[test]
fn migration_is_idempotent_and_sets_version() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("test.db");
    {
        let conn = db::init_conn(&path).unwrap();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 3);
    }
    // 再次打开：迁移必须幂等
    let conn = db::init_conn(&path).unwrap();
    let v: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(v, 3);
    // WAL 生效
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap();
    assert_eq!(mode, "wal");
}

#[test]
fn character_crud_roundtrip() {
    let t = test_db();
    let input = sample_input("测试角色");

    let created = characters::create(&t.conn, &input).unwrap();
    assert_eq!(created.name, "测试角色");
    assert_eq!(created.first_messages, vec!["你好，{{user}}！"]);
    assert_eq!(created.tags, vec!["test", "中文"]);
    assert!(created.nsfw);
    // 头像以 data URL 返回
    assert!(created.avatar.unwrap().starts_with("data:image/png;base64,"));
    assert_eq!(
        created.extensions,
        Some(serde_json::json!({"world": {"book": {"name": "w1"}}}))
    );

    // 读取
    let fetched = characters::get(&t.conn, &created.id).unwrap().unwrap();
    assert_eq!(fetched.description, "一段描述");
    assert_eq!(fetched.system_prompt.as_deref(), Some("自定义系统提示"));

    // 列表
    let list = characters::list_summaries(&t.conn).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "测试角色");
    assert!(list[0].nsfw);

    // 更新
    let mut updated_input = input;
    updated_input.name = "改名了".into();
    updated_input.nsfw = false;
    updated_input.avatar = None;
    let updated = characters::update(&t.conn, &created.id, &updated_input).unwrap();
    assert_eq!(updated.name, "改名了");
    assert!(!updated.nsfw);
    assert!(updated.avatar.is_none());

    // 删除
    characters::delete(&t.conn, &created.id).unwrap();
    assert!(characters::get(&t.conn, &created.id).unwrap().is_none());
}

#[test]
fn delete_character_cascades_conversations_and_messages() {
    let t = test_db();
    let created = characters::create(&t.conn, &sample_input("级联测试")).unwrap();
    let conv = conversations::create(&t.conn, &created.id, None).unwrap();
    // 创建时已插入开场白；再补一条
    messages::insert(&t.conn, &conv.id, "user", "你好").unwrap();

    characters::delete(&t.conn, &created.id).unwrap();

    assert!(conversations::list_by_character(&t.conn, &created.id).unwrap().is_empty());
    assert!(messages::list(&t.conn, &conv.id).unwrap().is_empty());
}

#[test]
fn message_seq_strictly_increasing() {
    let t = test_db();
    // 无开场白的角色，对话从空开始，便于验证 seq
    let mut input = sample_input("seq");
    input.first_messages = vec![];
    let created = characters::create(&t.conn, &input).unwrap();
    let conv = conversations::create(&t.conn, &created.id, None).unwrap();
    let mut seqs = Vec::new();
    for i in 0..10 {
        let m = messages::insert(&t.conn, &conv.id, if i % 2 == 0 { "user" } else { "assistant" }, &format!("消息{i}")).unwrap();
        seqs.push(m.seq);
    }
    let expected: Vec<i64> = (1..=10).collect();
    assert_eq!(seqs, expected);
    let all = messages::list(&t.conn, &conv.id).unwrap();
    assert_eq!(all.len(), 10);
    assert_eq!(all[0].content, "消息0");
    assert_eq!(all[9].content, "消息9");
    // 顺序与 seq 一致
    for w in all.windows(2) {
        assert!(w[0].seq < w[1].seq);
    }
}

#[test]
fn settings_defaults_and_upsert() {
    let t = test_db();
    // 空库 = 默认值
    let d = settings::get(&t.conn).unwrap();
    assert_eq!(d.base_url, "https://api.openai.com/v1");
    assert_eq!(d.model, "gpt-4o-mini");
    assert_eq!(d.temperature, 0.8);
    assert_eq!(d.max_tokens, 1024);
    assert_eq!(d.max_context_tokens, 8192);
    assert!(d.api_key.is_empty());

    // upsert 自定义值
    let custom = Settings {
        base_url: "http://localhost:11434/v1".into(),
        api_key: "sk-test".into(),
        model: "qwen2.5:7b".into(),
        temperature: 1.1,
        max_tokens: 2048,
        max_context_tokens: 4096,
        system_prompt: "你是测试助手".into(),
        ui_theme: "dark".into(),
        ui_font_size: 14,
        ..Default::default()
    };
    settings::update(&t.conn, &custom).unwrap();
    let got = settings::get(&t.conn).unwrap();
    assert_eq!(got, custom);

    // 独立连接（新库）仍是默认值
    let t2 = test_db();
    let d2 = settings::get(&t2.conn).unwrap();
    assert_eq!(d2, Settings::default());
}

#[test]
fn conversation_gets_greeting_on_create() {
    let t = test_db();
    let created = characters::create(&t.conn, &sample_input("开场")).unwrap();
    let conv = conversations::create(&t.conn, &created.id, None).unwrap();
    let msgs = messages::list(&t.conn, &conv.id).unwrap();
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].role, "assistant");
    assert_eq!(msgs[0].content, "你好，{{user}}！");

    // 无开场白的角色 → 空对话
    let mut no_first = sample_input("无开场");
    no_first.first_messages = vec![];
    let c2 = characters::create(&t.conn, &no_first).unwrap();
    let conv2 = conversations::create(&t.conn, &c2.id, None).unwrap();
    assert!(messages::list(&t.conn, &conv2.id).unwrap().is_empty());

    // 对话列表带消息数
    let list = conversations::list_by_character(&t.conn, &created.id).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].message_count, 1);
}

#[test]
fn rename_and_delete_conversation() {
    let t = test_db();
    let created = characters::create(&t.conn, &sample_input("改名")).unwrap();
    let conv = conversations::create(&t.conn, &created.id, None).unwrap();
    conversations::rename(&t.conn, &conv.id, "深夜闲聊").unwrap();
    let got = conversations::get(&t.conn, &conv.id).unwrap().unwrap();
    assert_eq!(got.title, "深夜闲聊");

    conversations::delete(&t.conn, &conv.id).unwrap();
    assert!(conversations::get(&t.conn, &conv.id).unwrap().is_none());
}

#[test]
fn delete_from_seq_truncates_tail() {
    let t = test_db();
    let created = characters::create(&t.conn, &sample_input("截断")).unwrap();
    let conv = conversations::create(&t.conn, &created.id, None).unwrap();
    // 删掉开场白，从空开始
    messages::delete_all(&t.conn, &conv.id).unwrap();
    let u1 = messages::insert(&t.conn, &conv.id, "user", "第一问").unwrap();
    messages::insert(&t.conn, &conv.id, "assistant", "第一答").unwrap();
    let u2 = messages::insert(&t.conn, &conv.id, "user", "第二问").unwrap();
    messages::insert(&t.conn, &conv.id, "assistant", "第二答").unwrap();

    // 截断到 u2：u2 及其后全部删除
    messages::delete_from_seq(&t.conn, &conv.id, u2.seq).unwrap();
    let rest = messages::list(&t.conn, &conv.id).unwrap();
    assert_eq!(rest.len(), 2);
    assert_eq!(rest[0].content, "第一问");
    assert_eq!(rest[1].content, "第一答");

    // 截断到 u1（重新发送第一问的场景）：u1 起全部删除
    messages::delete_from_seq(&t.conn, &conv.id, u1.seq).unwrap();
    assert!(messages::list(&t.conn, &conv.id).unwrap().is_empty());
}
