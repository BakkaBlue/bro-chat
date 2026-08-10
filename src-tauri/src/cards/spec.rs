//! SillyTavern chara v1/v2 卡片规范 <-> 内部 Character 映射。
//! 未建模的 v2 标量（creator/creator_notes/character_version/
//! post_history_instructions/character_book）与 extensions 对象合并存入
//! extensions 列（保留键 `_v2_extra`），导出时还原，实现无损往返。

use serde::{Deserialize, Serialize};

use crate::models::{Character, CharacterInput};

const EXTRA_KEY: &str = "_v2_extra";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct V2Card {
    pub spec: String,
    #[serde(default)]
    pub spec_version: String,
    pub data: CharaData,
}

/// chara v1/v2 共用的数据字段（v1 在根，v2 在 data 下）
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct CharaData {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub first_mes: String,
    #[serde(default)]
    pub mes_example: String,
    #[serde(default)]
    pub creator_notes: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub post_history_instructions: String,
    #[serde(default)]
    pub alternate_greetings: Vec<String>,
    #[serde(default)]
    pub character_book: Option<serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub creator: String,
    #[serde(default)]
    pub character_version: String,
    #[serde(default)]
    pub extensions: Option<serde_json::Value>,
}

/// 未建模标量的容器，存入 extensions 列的 `_v2_extra` 键
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct V2Extra {
    #[serde(default)]
    creator: String,
    #[serde(default)]
    creator_notes: String,
    #[serde(default)]
    character_version: String,
    #[serde(default)]
    post_history_instructions: String,
    #[serde(default)]
    character_book: Option<serde_json::Value>,
}

impl V2Extra {
    fn is_empty(&self) -> bool {
        self.creator.is_empty()
            && self.creator_notes.is_empty()
            && self.character_version.is_empty()
            && self.post_history_instructions.is_empty()
            && self.character_book.is_none()
    }
}

/// 解析卡片 JSON：自动识别 v2（data 包装）与 v1（根字段）
pub fn parse_json(text: &str) -> Result<CharaData, serde_json::Error> {
    let v: serde_json::Value = serde_json::from_str(text)?;
    if v.get("data").is_some() {
        let card: V2Card = serde_json::from_value(v)?;
        Ok(card.data)
    } else {
        serde_json::from_value(v)
    }
}

/// CharaData → 角色输入（头像由调用方补上）
pub fn card_to_input(data: &CharaData) -> CharacterInput {
    let mut first_messages: Vec<String> = Vec::new();
    if !data.first_mes.trim().is_empty() {
        first_messages.push(data.first_mes.clone());
    }
    for g in &data.alternate_greetings {
        if !g.trim().is_empty() {
            first_messages.push(g.clone());
        }
    }

    let extra = V2Extra {
        creator: data.creator.clone(),
        creator_notes: data.creator_notes.clone(),
        character_version: data.character_version.clone(),
        post_history_instructions: data.post_history_instructions.clone(),
        character_book: data.character_book.clone(),
    };

    let mut extensions = serde_json::Map::new();
    if let Some(serde_json::Value::Object(map)) = &data.extensions {
        for (k, v) in map {
            if !v.is_null() {
                extensions.insert(k.clone(), v.clone());
            }
        }
    }
    if !extra.is_empty() {
        extensions.insert(EXTRA_KEY.into(), serde_json::to_value(extra).unwrap());
    }

    CharacterInput {
        name: data.name.clone(),
        description: data.description.clone(),
        personality: data.personality.clone(),
        scenario: data.scenario.clone(),
        first_messages,
        example_messages: data.mes_example.clone(),
        system_prompt: if data.system_prompt.trim().is_empty() {
            None
        } else {
            Some(data.system_prompt.clone())
        },
        tags: data.tags.clone(),
        nsfw: false, // ST 卡片无此字段，保持本地默认
        avatar: None,
        extensions: if extensions.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(extensions))
        },
    }
}

/// 角色 → CharaData（导出用），还原 extensions 列里的未建模字段
pub fn apply_to_card(c: &Character, data: &mut CharaData) {
    data.name = c.name.clone();
    data.description = c.description.clone();
    data.personality = c.personality.clone();
    data.scenario = c.scenario.clone();
    data.first_mes = c.first_messages.first().cloned().unwrap_or_default();
    data.alternate_greetings = c.first_messages.iter().skip(1).cloned().collect();
    data.mes_example = c.example_messages.clone();
    data.system_prompt = c.system_prompt.clone().unwrap_or_default();
    data.tags = c.tags.clone();

    if let Some(serde_json::Value::Object(map)) = &c.extensions {
        if let Some(serde_json::Value::Object(extra_map)) = map.get(EXTRA_KEY) {
            if let Ok(extra) =
                serde_json::from_value::<V2Extra>(serde_json::Value::Object(extra_map.clone()))
            {
                data.creator = extra.creator;
                data.creator_notes = extra.creator_notes;
                data.character_version = extra.character_version;
                data.post_history_instructions = extra.post_history_instructions;
                data.character_book = extra.character_book;
            }
        }
        let mut rest = serde_json::Map::new();
        for (k, v) in map {
            if k != EXTRA_KEY {
                rest.insert(k.clone(), v.clone());
            }
        }
        data.extensions = Some(serde_json::Value::Object(rest));
    }
}

/// 以 v2 包装序列化卡片（PNG 嵌入与 JSON 导出共用）
pub fn serialize_v2(data: &CharaData) -> String {
    serde_json::to_string_pretty(&V2Card {
        spec: "chara_card_v2".into(),
        spec_version: "2.0".into(),
        data: data.clone(),
    })
    .expect("卡片序列化不应失败")
}
