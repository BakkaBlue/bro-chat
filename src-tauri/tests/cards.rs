// Stage 2: 角色卡（SillyTavern 兼容）测试
use brochat_lib::cards::{io, png_chunks, spec};
use brochat_lib::db::{self, characters};
use rusqlite::Connection;
use tempfile::TempDir;

fn test_conn() -> (TempDir, Connection) {
    let dir = TempDir::new().unwrap();
    let conn = db::init_conn(&dir.path().join("test.db")).unwrap();
    (dir, conn)
}

/// 手搓最小 PNG（1x1 RGBA 头 + 任意 IDAT），结构合法
fn fixture_png() -> Vec<u8> {
    fn chunk(chunk_type: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut crc_input = Vec::with_capacity(4 + data.len());
        crc_input.extend_from_slice(chunk_type);
        crc_input.extend_from_slice(data);
        let mut out = Vec::new();
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        out.extend_from_slice(chunk_type);
        out.extend_from_slice(data);
        out.extend_from_slice(&crc32fast::hash(&crc_input).to_be_bytes());
        out
    }
    let sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let mut png = Vec::new();
    png.extend_from_slice(&sig);
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&1u32.to_be_bytes());
    ihdr.extend_from_slice(&1u32.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    png.extend_from_slice(&chunk(b"IHDR", &ihdr));
    png.extend_from_slice(&chunk(b"IDAT", &[0x78, 0x9C, 0x63, 0x00]));
    png.extend_from_slice(&chunk(b"IEND", &[]));
    png
}

/// 一个塞满字段的 v2 卡片
fn full_card_json() -> String {
    serde_json::json!({
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": {
            "name": "林晓",
            "description": "咖啡馆的常客，话少但观察力强。",
            "personality": "冷静、毒舌、嘴硬心软",
            "scenario": "你走进一家深夜还亮着灯的咖啡馆。",
            "first_mes": "这么晚了还来？只剩吧台的位置了。",
            "mes_example": "<START>\n{{user}}：这么晚还营业？\n{{char}}：你这不是还坐着吗。",
            "creator_notes": "原创角色，欢迎使用",
            "system_prompt": "你是林晓，一家深夜咖啡馆的店长。",
            "post_history_instructions": "保持简短回复。",
            "alternate_greetings": [
                "欢迎光临，喝点什么？",
                "今天打烊了——开个玩笑，坐吧。"
            ],
            "character_book": {"name": "咖啡馆世界观", "entries": []},
            "tags": ["咖啡馆", "毒舌"],
            "creator": "BakkaBlue",
            "character_version": "1.0",
            "extensions": {
                "world": {"book": {"name": "深夜咖啡馆", "is_embedding": true}},
                "talkativeness": "0.6"
            }
        }
    })
    .to_string()
}

#[test]
fn v2_card_roundtrip_through_db() {
    let (_dir, conn) = test_conn();

    let parsed = spec::parse_json(&full_card_json()).unwrap();
    let input = spec::card_to_input(&parsed);
    // first_mes + alternate_greetings → first_messages
    assert_eq!(input.first_messages.len(), 3);
    assert_eq!(input.first_messages[0], "这么晚了还来？只剩吧台的位置了。");
    assert_eq!(input.system_prompt.as_deref(), Some("你是林晓，一家深夜咖啡馆的店长。"));
    assert_eq!(input.tags, vec!["咖啡馆", "毒舌"]);
    // 未建模标量进了 extensions 的 _v2_extra
    let ext = input.extensions.as_ref().unwrap().as_object().unwrap();
    assert!(ext.contains_key("_v2_extra"));
    assert!(ext.contains_key("world"));
    assert!(ext.contains_key("talkativeness"));

    // 入库 → 取回 → 导出 → 再解析，全部字段无损
    let created = characters::create(&conn, &input).unwrap();
    let fetched = characters::get(&conn, &created.id).unwrap().unwrap();
    let mut data = spec::CharaData::default();
    spec::apply_to_card(&fetched, &mut data, None);
    let re_parsed = spec::parse_json(&spec::serialize_v2(&data)).unwrap();
    assert_eq!(re_parsed, parsed);
}

#[test]
fn v1_card_import() {
    let v1 = serde_json::json!({
        "name": "老角色",
        "description": "v1 描述",
        "personality": "温和",
        "scenario": "雨夜",
        "first_mes": "下雨了，进来躲躲吧。",
        "mes_example": "{{user}}：你好\n{{char}}：你好",
        "tags": ["v1"]
    })
    .to_string();

    let parsed = spec::parse_json(&v1).unwrap();
    assert_eq!(parsed.name, "老角色");
    let input = spec::card_to_input(&parsed);
    assert_eq!(input.first_messages, vec!["下雨了，进来躲躲吧。"]);
    assert_eq!(input.tags, vec!["v1"]);
    // v1 没有未建模标量 → 无 _v2_extra
    let ext = input.extensions.as_ref().map(|e| e.as_object().is_some());
    assert!(ext.is_none() || ext == Some(false));
}

#[test]
fn first_messages_roundtrip_with_alternates() {
    let (_dir, conn) = test_conn();

    let parsed = spec::parse_json(&full_card_json()).unwrap();
    let input = spec::card_to_input(&parsed);
    let created = characters::create(&conn, &input).unwrap();
    let fetched = characters::get(&conn, &created.id).unwrap().unwrap();

    let mut data = spec::CharaData::default();
    spec::apply_to_card(&fetched, &mut data, None);
    assert_eq!(data.first_mes, "这么晚了还来？只剩吧台的位置了。");
    assert_eq!(
        data.alternate_greetings,
        vec!["欢迎光临，喝点什么？", "今天打烊了——开个玩笑，坐吧。"]
    );
}

#[test]
fn png_card_import_export_roundtrip() {
    let (_dir, conn) = test_conn();
    let tmp = TempDir::new().unwrap();

    // 构造带 chara 的 PNG 卡文件（用 serialize_v2 序列化，保证与导出侧字节一致）
    let avatar = fixture_png();
    let parsed = spec::parse_json(&full_card_json()).unwrap();
    let embedded = png_chunks::embed_chara(&avatar, &spec::serialize_v2(&parsed)).unwrap();
    let import_path = tmp.path().join("林晓.png");
    std::fs::write(&import_path, &embedded).unwrap();

    // 导入：头像字节精确 + 字段正确
    let (data, avatar_bytes) = io::read_card(&import_path).unwrap();
    let imported_avatar = avatar_bytes.unwrap();
    assert_eq!(imported_avatar, embedded); // 头像 = 卡片文件原样字节（含 chara chunk）
    assert_eq!(data.name, "林晓");

    // 入库后导出 PNG 卡
    let mut input = spec::card_to_input(&data);
    input.avatar = Some(brochat_lib::avatar::encode(&imported_avatar));
    let created = characters::create(&conn, &input).unwrap();
    let fetched = characters::get(&conn, &created.id).unwrap().unwrap();
    let export_path = tmp.path().join("export.png");
    io::write_card(&export_path, &fetched, None).unwrap();

    // 再读回来：数据一致，头像与首次导入字节一致（chara 跳过不叠加）
    let (data2, avatar2) = io::read_card(&export_path).unwrap();
    assert_eq!(data2, data);
    assert_eq!(avatar2.unwrap(), imported_avatar);
}

#[test]
fn json_card_write_and_read() {
    let (_dir, conn) = test_conn();
    let tmp = TempDir::new().unwrap();

    let parsed = spec::parse_json(&full_card_json()).unwrap();
    let input = spec::card_to_input(&parsed);
    let created = characters::create(&conn, &input).unwrap();
    let fetched = characters::get(&conn, &created.id).unwrap().unwrap();

    let path = tmp.path().join("林晓.json");
    io::write_card(&path, &fetched, None).unwrap();
    let (data, avatar) = io::read_card(&path).unwrap();
    assert!(avatar.is_none());
    assert_eq!(data, parsed);
}

#[test]
fn rejects_bad_files() {
    let tmp = TempDir::new().unwrap();
    // 不是 PNG 的 PNG 卡
    let bad_png = tmp.path().join("bad.png");
    std::fs::write(&bad_png, b"definitely not a png").unwrap();
    assert!(io::read_card(&bad_png).is_err());

    // PNG 里没有 chara
    let no_chara = tmp.path().join("plain.png");
    std::fs::write(&no_chara, fixture_png()).unwrap();
    assert!(io::read_card(&no_chara).is_err());

    // 不支持的格式
    let txt = tmp.path().join("a.txt");
    std::fs::write(&txt, "hello").unwrap();
    assert!(io::read_card(&txt).is_err());

    // JSON 语法错误
    let bad_json = tmp.path().join("bad.json");
    std::fs::write(&bad_json, "{not json").unwrap();
    assert!(io::read_card(&bad_json).is_err());
}

#[test]
fn export_png_requires_png_avatar() {
    let (_dir, conn) = test_conn();
    let tmp = TempDir::new().unwrap();

    let mut input = spec::card_to_input(&spec::parse_json(&full_card_json()).unwrap());
    input.avatar = Some(brochat_lib::avatar::encode(&[0xFF, 0xD8, 0xFF, 0xE0])); // JPEG
    let created = characters::create(&conn, &input).unwrap();
    let fetched = characters::get(&conn, &created.id).unwrap().unwrap();

    let png_path = tmp.path().join("out.png");
    assert!(io::write_card(&png_path, &fetched, None).is_err());

    let json_path = tmp.path().join("out.json");
    io::write_card(&json_path, &fetched, None).unwrap();
}
