import { invoke } from "@tauri-apps/api/core";
import type {
  Character,
  CharacterInput,
  CharacterSummary,
  ConversationSummary,
  Message,
  Settings,
} from "../types";

// 角色
export const listCharacters = () => invoke<CharacterSummary[]>("list_characters");
export const getCharacter = (id: string) => invoke<Character>("get_character", { id });
export const createCharacter = (input: CharacterInput) =>
  invoke<Character>("create_character", { input });
export const updateCharacter = (id: string, input: CharacterInput) =>
  invoke<Character>("update_character", { id, input });
export const deleteCharacter = (id: string) => invoke<void>("delete_character", { id });
export const importCard = (path: string) => invoke<Character>("import_card", { path });
export const exportCard = (id: string, path: string) =>
  invoke<void>("export_card", { id, path });

// 对话
export const listConversations = (characterId: string) =>
  invoke<ConversationSummary[]>("list_conversations", { characterId });
export const createConversation = (characterId: string) =>
  invoke<ConversationSummary>("create_conversation", { characterId });
export const renameConversation = (id: string, title: string) =>
  invoke<void>("rename_conversation", { id, title });
export const deleteConversation = (id: string) =>
  invoke<void>("delete_conversation", { id });
export const getMessages = (conversationId: string) =>
  invoke<Message[]>("get_messages", { conversationId });

// 聊天
export const sendMessage = (conversationId: string, content: string) =>
  invoke<string>("send_message", { conversationId, content });
export const cancelChat = (requestId: string) =>
  invoke<void>("cancel_chat", { requestId });
export const regenerateReply = (conversationId: string) =>
  invoke<string>("regenerate", { conversationId });

// 设置
export const getSettings = () => invoke<Settings>("get_settings");
export const updateSettings = (settings: Settings) =>
  invoke<void>("update_settings", { settings });
export const listModels = () => invoke<string[]>("list_models");
