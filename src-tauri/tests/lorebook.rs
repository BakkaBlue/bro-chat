// 世界书（lorebook）集成测试：数据层、卡片往返、注入位置、开场白下标
use brochat_lib::cards::spec;
use brochat_lib::db::{self, characters, conversations, lorebooks, messages};
use brochat_lib::llm::client::build_request_messages;
use brochat_lib::llm::lorebook::{build_lore_injection, scan_text_from};
use brochat_lib::models::{CharacterInput, LorebookInput, LoreEntryInput, Settings};
use rusqlite::Connection;
use tempfile::TempDir;

fn test_conn() -> (TempDir, Connection) {
    let dir = TempDir::new().unwrap();
    let conn = db::init_conn(&dir.path().join("test.db")).unwrap();
    (dir, conn)
}

fn char_input() -> CharacterInput {
    CharacterInput {
        name: "世界书角色".into(),
        description: "描述".into(),
        personality: "性格".into(),
        scenario: "场景".into(),
        first_messages: vec!["开场一".into(), "开场二".into(), "开场三".into()],
        example_messages: String::new(),
        system_prompt: None,
        tags: vec![],
        nsfw: false,
        avatar: None,
        extensions: None,
    }
}

fn lore_input() -> LorebookInput {
    LorebookInput {
        name: "咖啡馆世界观".into(),
        description: "深夜咖啡馆的设定".into(),
        scan_depth: 4,
        token_budget: 500,
        recursive_scanning: false,
        enabled: true,
        entries: vec![
            LoreEntryInput {
                keys: vec!["咖啡".into()],
                secondary_keys: vec![],
                comment: String::new(),
                content: "店里的咖啡豆来自秘鲁。".into(),
                constant: false,
                selective: false,
                insertion_order: 0,
                enabled: true,
                position: "before_char".into(),
            },
            LoreEntryInput {
                keys: vec![],
                secondary_keys: vec![],
                comment: String::new(),
                content: "吧台后面的旧唱片机还能用。".into(),
                constant: true,
                selective: false,
                insertion_order: 1,
                enabled: true,
                position: "after_char".into(),
            },
        ],
    }
}

#[test]
fn lorebook_save_get_replace() {
    let (_dir, conn) = test_conn();
    let c = characters::create(&conn, &char_input()).unwrap();

    // 保存
    let saved = lorebooks::save(&conn, &c.id, &lore_input()).unwrap();
    assert_eq!(saved.name, "咖啡馆世界观");
    assert_eq!(saved.entries.len(), 2);
    assert_eq!(saved.entries[0].keys, vec!["咖啡"]);
    assert!(saved.entries[1].constant);

    // 读取
    let got = lorebooks::get_by_character(&conn, &c.id).unwrap().unwrap();
    assert_eq!(got.entries.len(), 2);

    // 整书替换：换掉全部条目
    let mut replaced = lore_input();
    replaced.entries = vec![LoreEntryInput {
        keys: vec!["唱片机".into()],
        secondary_keys: vec![],
        comment: String::new(),
        content: "新的条目".into(),
        constant: false,
        selective: false,
        insertion_order: 0,
        enabled: true,
        position: "before_char".into(),
    }];
    lorebooks::save(&conn, &c.id, &replaced).unwrap();
    let got = lorebooks::get_by_character(&conn, &c.id).unwrap().unwrap();
    assert_eq!(got.entries.len(), 1);
    assert_eq!(got.entries[0].content, "新的条目");

    // 删除角色级联删除世界书
    characters::delete(&conn, &c.id).unwrap();
    assert!(lorebooks::get_by_character(&conn, &c.id).unwrap().is_none());
}

#[test]
fn character_book_roundtrip_via_spec() {
    // ST character_book → lore input → 世界书 → 再转回 character_book，字段一致
    let st_book = serde_json::json!({
        "name": "w1",
        "description": "d1",
        "scan_depth": 6,
        "token_budget": 800,
        "recursive_scanning": true,
        "extensions": {},
        "entries": [{
            "keys": ["钥匙", "key"],
            "secondary_keys": ["门"],
            "comment": "重要条目",
            "content": "金色钥匙能打开地下室的门。",
            "constant": false,
            "selective": true,
            "insertion_order": 3,
            "enabled": true,
            "position": "after_char",
            "extensions": {}
        }]
    });

    let input = spec::character_book_to_lore_input(&st_book).unwrap();
    assert_eq!(input.name, "w1");
    assert_eq!(input.scan_depth, 6);
    assert_eq!(input.entries.len(), 1);
    assert_eq!(input.entries[0].keys, vec!["钥匙", "key"]);
    assert!(input.entries[0].selective);
    assert_eq!(input.entries[0].position, "after_char");

    // 存库再转回
    let (_dir, conn) = test_conn();
    let c = characters::create(&conn, &char_input()).unwrap();
    let book = lorebooks::save(&conn, &c.id, &input).unwrap();
    let back = spec::lorebook_to_character_book(&book);
    assert_eq!(back["name"], "w1");
    assert_eq!(back["scan_depth"], 6);
    assert_eq!(back["entries"][0]["keys"], serde_json::json!(["钥匙", "key"]));
    assert_eq!(back["entries"][0]["position"], "after_char");
}

#[test]
fn lore_injected_into_request_messages() {
    let (_dir, conn) = test_conn();
    let c = characters::create(&conn, &char_input()).unwrap();
    let book = lorebooks::save(&conn, &c.id, &lore_input()).unwrap();
    let conv = conversations::create(&conn, &c.id, None).unwrap();
    messages::insert(&conn, &conv.id, "user", "来杯咖啡").unwrap();
    let history = messages::list(&conn, &conv.id).unwrap();

    let scan = scan_text_from(&history, book.scan_depth as usize);
    let lore = build_lore_injection(&book.entries, &scan, book.token_budget as usize);
    let s = Settings::default();
    let msgs = build_request_messages(&c, &s, &history, &lore);

    let sys = msgs.iter().find(|m| m.role == "system").unwrap();
    let content = &sys.content;
    // before_char 条目（咖啡关键词命中）在角色描述之前
    assert!(content.contains("秘鲁"), "关键词条目应注入: {content}");
    // 常驻条目在角色设定之后
    assert!(content.contains("唱片机"));
    // 位置：描述在 before_char 条目之后
    let desc_pos = content.find("【角色设定·描述】").unwrap();
    let lore_pos = content.find("秘鲁").unwrap();
    assert!(lore_pos < desc_pos, "before_char 条目应排在角色设定前");
    // 常驻 after_char 条目在场景之后
    let scene_pos = content.find("【角色设定·场景】").unwrap();
    let after_pos = content.find("唱片机").unwrap();
    assert!(after_pos > scene_pos, "after_char 条目应排在角色设定后");
}

#[test]
fn greeting_index_selects_specific_greeting() {
    let (_dir, conn) = test_conn();
    let c = characters::create(&conn, &char_input()).unwrap();

    // 指定第二条开场白
    let conv = conversations::create(&conn, &c.id, Some(1)).unwrap();
    let msgs = messages::list(&conn, &conv.id).unwrap();
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].content, "开场二");

    // 越界下标回退到第一条
    let conv = conversations::create(&conn, &c.id, Some(99)).unwrap();
    let msgs = messages::list(&conn, &conv.id).unwrap();
    assert_eq!(msgs[0].content, "开场一");

    // None = 第一条（默认）
    let conv = conversations::create(&conn, &c.id, None).unwrap();
    let msgs = messages::list(&conn, &conv.id).unwrap();
    assert_eq!(msgs[0].content, "开场一");
}
