import { create } from "zustand";
import type { Message } from "../types";
import * as api from "../api/commands";
import type { ChunkPayload, CancelledPayload, DonePayload, ErrorPayload } from "../api/events";
import { useUiStore } from "./uiStore";
import { useConversationStore } from "./conversationStore";

interface StreamingState {
  requestId: string;
  conversationId: string;
  text: string;
}

interface ChatState {
  messages: Message[];
  streaming: StreamingState | null;
  loading: boolean;
  lastError: string | null;

  load: (conversationId: string | null) => Promise<void>;
  send: (content: string) => Promise<void>;
  stop: () => void;
  /** 重新生成最后一条 assistant 回复（Rust 侧删除该条后重新流式请求） */
  regenerate: () => Promise<void>;
  reset: () => void;

  // 事件层回调（App.tsx 注册 listen 后分发到这里）
  onChunk: (p: ChunkPayload) => void;
  onDone: (p: DonePayload) => void;
  onError: (p: ErrorPayload) => void;
  onCancelled: (p: CancelledPayload) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: null,
  loading: false,
  lastError: null,

  load: async (conversationId) => {
    if (!conversationId) {
      set({ messages: [], streaming: null, lastError: null });
      return;
    }
    set({ loading: true });
    try {
      const messages = await api.getMessages(conversationId);
      set({ messages, lastError: null });
    } catch (e) {
      set({ lastError: `加载消息失败: ${e}` });
    } finally {
      set({ loading: false });
    }
  },

  send: async (content) => {
    const text = content.trim();
    if (!text) return;
    const { selectedId } = useConversationStore.getState();
    if (!selectedId) {
      useUiStore.getState().showToast("请先选择对话");
      return;
    }
    if (get().streaming) {
      useUiStore.getState().showToast("已有生成中的回复");
      return;
    }
    try {
      const requestId = await api.sendMessage(selectedId, text);
      // 发送后刷新列表（自动标题/消息数/排序变化）
      useConversationStore.getState().refresh();
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
        streaming: { requestId, conversationId: selectedId, text: "" },
      }));
    } catch (e) {
      set({ lastError: String(e) });
    }
  },

  stop: () => {
    const { streaming } = get();
    if (streaming) {
      api.cancelChat(streaming.requestId).catch(() => {});
    }
  },

  regenerate: async () => {
    const { selectedId } = useConversationStore.getState();
    if (!selectedId || get().streaming) return;
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
        streaming: { requestId, conversationId: selectedId, text: "" },
      });
    } catch (e) {
      set({ lastError: String(e) });
    }
  },

  reset: () => set({ messages: [], streaming: null, lastError: null }),

  onChunk: (p) => {
    const { streaming } = get();
    if (streaming && streaming.requestId === p.requestId) {
      set({ streaming: { ...streaming, text: streaming.text + p.delta } });
    }
  },

  // 事件到达后统一从服务端拉取最新消息，保证 id/seq 一致
  onDone: (p) => {
    const { streaming } = get();
    if (!streaming || streaming.requestId !== p.requestId) return;
    const convId = streaming.conversationId;
    set({ streaming: null, lastError: null });
    get().load(convId);
    useConversationStore.getState().refresh();
  },

  onError: (p) => {
    const { streaming } = get();
    if (!streaming || streaming.requestId !== p.requestId) return;
    const convId = streaming.conversationId;
    set({ streaming: null, lastError: p.message });
    if (p.partialSaved) {
      // 部分回复已保存，重新拉取
      get().load(convId);
    }
  },

  onCancelled: (p) => {
    const { streaming } = get();
    if (!streaming || streaming.requestId !== p.requestId) return;
    const convId = streaming.conversationId;
    set({ streaming: null });
    if (p.partialSaved) {
      get().load(convId);
    }
  },
}));
