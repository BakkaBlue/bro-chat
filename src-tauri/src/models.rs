use serde::{Deserialize, Serialize};

/// 完整角色记录。avatar 以 data URL 形式返回给前端。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    /// 开场白列表，第一个是默认开场白（ST: first_mes + alternate_greetings）
    pub first_messages: Vec<String>,
    /// 示例对话块（ST: mes_example，含 {{user}}/{{char}} 令牌）
    pub example_messages: String,
    /// 自定义系统提示词；None = 用设置里的默认值
    pub system_prompt: Option<String>,
    pub tags: Vec<String>,
    pub nsfw: bool,
    /// data URL（image/png 等），None = 无头像
    pub avatar: Option<String>,
    /// ST 扩展字段透传（无损往返）
    pub extensions: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建/更新角色的输入（id 和时间戳由 Rust 侧生成）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub first_messages: Vec<String>,
    #[serde(default)]
    pub example_messages: String,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub nsfw: bool,
    /// 接受 data URL 或纯 base64，None = 无头像/不改动
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub extensions: Option<serde_json::Value>,
}

/// 侧边栏列表摘要（头像以 data URL 返回，便于列表直接渲染）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSummary {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    pub nsfw: bool,
    pub avatar: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub character_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub character_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String, // user | assistant | system
    pub content: String,
    pub seq: i64,
    pub created_at: String,
}

/// 全局设置。所有字段有默认值，空 api_key = 不发送 Authorization 头（Ollama）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    #[serde(default = "Settings::default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "Settings::default_model")]
    pub model: String,
    #[serde(default = "Settings::default_temperature")]
    pub temperature: f64,
    #[serde(default = "Settings::default_max_tokens")]
    pub max_tokens: i64,
    #[serde(default = "Settings::default_max_context_tokens")]
    pub max_context_tokens: i64,
    #[serde(default)]
    pub system_prompt: String,
    /// 界面主题：system | light | dark
    #[serde(default = "Settings::default_ui_theme")]
    pub ui_theme: String,
    /// 界面字号（px）
    #[serde(default = "Settings::default_ui_font_size")]
    pub ui_font_size: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: Self::default_base_url(),
            api_key: String::new(),
            model: Self::default_model(),
            temperature: Self::default_temperature(),
            max_tokens: Self::default_max_tokens(),
            max_context_tokens: Self::default_max_context_tokens(),
            system_prompt: String::new(),
            ui_theme: Self::default_ui_theme(),
            ui_font_size: Self::default_ui_font_size(),
        }
    }
}

impl Settings {
    pub fn default_base_url() -> String {
        "https://api.openai.com/v1".into()
    }
    pub fn default_model() -> String {
        "gpt-4o-mini".into()
    }
    pub fn default_temperature() -> f64 {
        0.8
    }
    pub fn default_max_tokens() -> i64 {
        1024
    }
    pub fn default_max_context_tokens() -> i64 {
        8192
    }
    pub fn default_ui_theme() -> String {
        "system".into()
    }
    pub fn default_ui_font_size() -> i64 {
        13
    }
}

// ---------- 世界书（lorebook） ----------

/// 世界书：一个角色一本（character_id 唯一），含条目列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lorebook {
    pub id: String,
    pub character_id: String,
    pub name: String,
    pub description: String,
    /// 关键词扫描的历史消息深度（条数）
    pub scan_depth: i64,
    /// 单轮注入的 token 预算
    pub token_budget: i64,
    pub recursive_scanning: bool,
    pub enabled: bool,
    pub entries: Vec<LoreEntry>,
    pub created_at: String,
    pub updated_at: String,
}

/// 世界书条目（对应 ST character_book.entries 结构）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoreEntry {
    pub id: String,
    pub keys: Vec<String>,
    pub secondary_keys: Vec<String>,
    pub comment: String,
    pub content: String,
    /// 常驻：无条件注入
    pub constant: bool,
    /// 需要主关键词 + 副关键词同时命中才激活
    pub selective: bool,
    /// 注入顺序（小在前）
    pub insertion_order: i64,
    pub enabled: bool,
    /// before_char | after_char
    pub position: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 保存世界书的输入（整书替换）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LorebookInput {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_scan_depth")]
    pub scan_depth: i64,
    #[serde(default = "default_token_budget")]
    pub token_budget: i64,
    #[serde(default)]
    pub recursive_scanning: bool,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub entries: Vec<LoreEntryInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoreEntryInput {
    #[serde(default)]
    pub keys: Vec<String>,
    #[serde(default)]
    pub secondary_keys: Vec<String>,
    #[serde(default)]
    pub comment: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub constant: bool,
    #[serde(default)]
    pub selective: bool,
    #[serde(default)]
    pub insertion_order: i64,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub position: String,
}

pub fn default_scan_depth() -> i64 {
    4
}
pub fn default_token_budget() -> i64 {
    500
}
