// 与 Rust 侧 models.rs 对应的领域类型

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_messages: string[];
  example_messages: string;
  system_prompt: string | null;
  tags: string[];
  nsfw: boolean;
  avatar: string | null; // data URL
  extensions: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterInput {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_messages?: string[];
  example_messages?: string;
  system_prompt?: string | null;
  tags?: string[];
  nsfw?: boolean;
  avatar?: string | null;
  extensions?: unknown | null;
}

export interface CharacterSummary {
  id: string;
  name: string;
  tags: string[];
  nsfw: boolean;
  avatar: string | null;
  character_version: string | null;
  updated_at: string;
}

export interface ConversationSummary {
  id: string;
  character_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  seq: number;
  created_at: string;
}

export interface Settings {
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  max_tokens: number;
  max_context_tokens: number;
  chat_auto_title: boolean;
  system_prompt: string;
  ui_theme: "system" | "light" | "dark";
  ui_font_size: number;
  ui_avatar_style: string; // "" | "circle"
  ui_chat_style: string; // "" | "flat"
  ui_show_timestamps: boolean;
  ui_avatar_hover_zoom: boolean;
  ui_reduce_motion: boolean;
  ui_text_shadow: boolean;
  ui_message_animation: boolean;
  ui_auto_expand_actions: boolean;
  ui_reply_timer: boolean;
  ui_show_floor: boolean;
  ui_show_token_count: boolean;
  ui_click_to_edit: boolean;
  char_show_version: boolean;
  chat_sound: boolean;
  chat_debug_prompt: boolean;
  chat_load_messages: number;
  chat_auto_scroll: boolean;
  chat_confirm_delete: boolean;
  chat_block_external_media: boolean;
  chat_substitute_in_assistant: boolean;
  chat_enter_mode: string; // "" | "newline"
  chat_auto_load_last: boolean;
}

// ---------- 世界书（lorebook） ----------

export interface LoreEntry {
  id: string;
  keys: string[];
  secondary_keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  insertion_order: number;
  enabled: boolean;
  position: string; // before_char | after_char
  created_at: string;
  updated_at: string;
}

export interface Lorebook {
  id: string;
  character_id: string;
  name: string;
  description: string;
  scan_depth: number;
  token_budget: number;
  recursive_scanning: boolean;
  enabled: boolean;
  entries: LoreEntry[];
  created_at: string;
  updated_at: string;
}

export interface LoreEntryInput {
  keys: string[];
  secondary_keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  insertion_order: number;
  enabled: boolean;
  position: string;
}

export interface LorebookInput {
  name: string;
  description: string;
  scan_depth: number;
  token_budget: number;
  recursive_scanning: boolean;
  enabled: boolean;
  entries: LoreEntryInput[];
}
