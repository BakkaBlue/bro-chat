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
  max_tokens: number;
  max_context_tokens: number;
  system_prompt: string;
  ui_theme: "system" | "light" | "dark";
  ui_font_size: number;
}
