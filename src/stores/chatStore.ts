import { create } from "zustand";
import type { Message } from "../types";
import * as api from "../api/commands";
import type { ChunkPayload, CancelledPayload, DonePayload, ErrorPayload } from "../api/events";
import { useUiStore } from "./uiStore";
import { useConversationStore } from "./conversationStore";
import { useSettingsStore } from "./settingsStore";
import { playSendSound } from "../utils/sound";

interface StreamingState {
  requestId: string;
  conversationId: string;
  text: string;
  startedAt: number;
}

interface ChatState {
  /** 当前显示的消息列表 */
  messages: Message[];
  /** messages 所属的对话 id（渲染层按此隔离，避免跨对话串显） */
  messagesFor: string | null;
  streaming: StreamingState | null;
  /** 发送/重发/重生成请求在途（invoke 未返回） */
  sending: boolean;
  loading: boolean;
  lastError: string | null;
  /** 最近一次回复耗时（毫秒，AI 回复计时器用） */
  lastReplyMs: number | null;

  load: (conversationId: string | null) => Promise<void>;
  /** 返回是否成功发送（调用方据此决定是否清空输入框） */
  send: (content: string) => Promise<boolean>;
  stop: () => void;
  /** 重新生成最后一条 assistant 回复（Rust 侧删除该条后重新流式请求） */
  regenerate: () => Promise<void>;
  /** 重新发送最后一条用户消息（截断其后内容，同内容重新请求） */
  resend: () => Promise<void>;
  /** 编辑消息内容（自动保存） */
  editMessage: (id: string, content: string) => Promise<void>;
  reset: () => void;

  // 事件层回调（App.tsx 注册 listen 后分发到这里）
  onChunk: (p: ChunkPayload) => void;
  onDone: (p: DonePayload) => void;
  onError: (p: ErrorPayload) => void;
  onCancelled: (p: CancelledPayload) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  messagesFor: null,
  streaming: null,
  sending: false,
  loading: false,
  lastError: null,
  lastReplyMs: null,

  load: async (conversationId) => {
    if (!conversationId) {
      set({ messages: [], messagesFor: null, streaming: null, lastError: null });
      return;
    }
    set({ loading: true, messagesFor: conversationId, lastError: null });
    try {
      const messages = await api.getMessages(conversationId);
      // 竞态校验：等待期间用户已切到别的对话则不覆盖
      if (useConversationStore.getState().selectedId !== conversationId) return;
      set({ messages, messagesFor: conversationId });
    } catch (e) {
      if (useConversationStore.getState().selectedId !== conversationId) return;
      // 失败时清空并标记归属，避免上一对话的消息串显
      set({ messages: [], messagesFor: conversationId, lastError: `加载消息失败: ${e}` });
    } finally {
      if (useConversationStore.getState().selectedId === conversationId) {
        set({ loading: false });
      }
    }
  },

  send: async (content) => {
    const text = content.trim();
    if (!text) return false;
    const { selectedId } = useConversationStore.getState();
    if (!selectedId) {
      useUiStore.getState().showToast("请先选择对话");
      return false;
    }
    if (get().streaming || get().sending) {
      useUiStore.getState().showToast("已有生成中的回复");
      return false;
    }
    // 在途标志：invoke 返回前就置位，防止双击重复发送（TOCTOU）
    set({ sending: true });
    try {
      const requestId = await api.sendMessage(selectedId, text);
      // 发送后刷新列表（自动标题/消息数/排序变化）
      useConversationStore.getState().refresh();
      if (useSettingsStore.getState().settings?.chat_sound) playSendSound();
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: `tmp-${requestId}`,
            conversation_id: selectedId,
            role: "user",
            content: text,
            seq: s.messages.length + 1,
            created_at: new Date().toISOString(),
          },
        ],
        streaming: {
          requestId,
          conversationId: selectedId,
          text: "",
          startedAt: Date.now(),
        },
        sending: false,
        lastReplyMs: null,
      }));
      return true;
    } catch (e) {
      set({ lastError: String(e), sending: false });
      return false;
    }
  },

  stop: () => {
    const { streaming } = get();
    if (streaming) {
      api.cancelChat(streaming.requestId).catch(() => {
        // 取消失败兜底：解除流式状态，避免按钮永久卡死
        set({ streaming: null });
      });
    }
  },

  regenerate: async () => {
    const { selectedId } = useConversationStore.getState();
    if (!selectedId || get().streaming || get().sending) return;
    // 本地无消息时不发起请求（避免服务端流成为孤儿）
    if (!get().messages.some((m) => m.role === "assistant")) return;
    set({ sending: true });
    try {
      const requestId = await api.regenerateReply(selectedId);
      // 与服务端一致：去掉最后一条 assistant 回复，进入流式占位
      const messages = get().messages;
      const lastAssistantIdx = [...messages]
        .reverse()
        .findIndex((m) => m.role === "assistant");
      const trimmed =
        lastAssistantIdx >= 0
          ? messages.slice(0, messages.length - lastAssistantIdx - 1)
          : messages;
      set({
        messages: trimmed,
        lastError: null,
        lastReplyMs: null,
        sending: false,
        streaming: {
          requestId,
          conversationId: selectedId,
          text: "",
          startedAt: Date.now(),
        },
      });
    } catch (e) {
      set({ lastError: String(e), sending: false });
    }
  },

  resend: async () => {
    const { selectedId } = useConversationStore.getState();
    if (!selectedId || get().streaming || get().sending) return;
    // 先本地校验再发请求（本地没有最后 user 消息就不动服务端）
    const messages = get().messages;
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      set({ lastError: "没有可重新发送的用户消息" });
      return;
    }
    set({ sending: true });
    try {
      const requestId = await api.resendLastMessage(selectedId);
      // 与服务端一致：截断到最后一条 user 消息之前，重新以该内容进入流式占位
      const lastUser = messages[idx];
      const trimmed = messages.slice(0, idx);
      set({
        messages: [...trimmed, { ...lastUser, id: `tmp-${requestId}` }],
        lastError: null,
        lastReplyMs: null,
        sending: false,
        streaming: {
          requestId,
          conversationId: selectedId,
          text: "",
          startedAt: Date.now(),
        },
      });
    } catch (e) {
      set({ lastError: String(e), sending: false });
    }
  },

  editMessage: async (id, content) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    }));
    try {
      await api.updateMessage(id, content);
    } catch (e) {
      set({ lastError: `编辑保存失败: ${e}` });
    }
  },

  reset: () =>
    set({ messages: [], messagesFor: null, streaming: null, lastError: null, sending: false }),

  onChunk: (p) => {
    const { streaming } = get();
    if (streaming && streaming.requestId === p.requestId) {
      set({ streaming: { ...streaming, text: streaming.text + p.delta } });
    }
  },

  // 事件到达后统一从服务端拉取最新消息，保证 id/seq 一致。
  // 仅在用户仍停留在该对话时重拉，避免跨对话串显。
  onDone: (p) => {
    const { streaming } = get();
    if (!streaming || streaming.requestId !== p.requestId) return;
    const convId = streaming.conversationId;
    const replyMs = Date.now() - streaming.startedAt;
    set({ streaming: null, lastError: null, lastReplyMs: replyMs });
    if (useConversationStore.getState().selectedId === convId) {
      get().load(convId);
    }
    useConversationStore.getState().refresh();
  },

  onError: (p) => {
    const { streaming } = get();
    if (!streaming || streaming.requestId !== p.requestId) return;
    const convId = streaming.conversationId;
    set({ streaming: null, lastError: p.message });
    if (useConversationStore.getState().selectedId === convId) {
      // 无论是否保留部分，都重拉以同步 tmp 占位与真实消息
      get().load(convId);
    }
  },

  onCancelled: (p) => {
    const { streaming } = get();
    if (!streaming || streaming.requestId !== p.requestId) return;
    const convId = streaming.conversationId;
    set({ streaming: null });
    if (useConversationStore.getState().selectedId === convId) {
      // 同步 tmp 用户消息为真实记录（即使没有部分回复）
      get().load(convId);
    }
  },
}));
