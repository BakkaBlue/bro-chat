import { create } from "zustand";
import type { ConversationSummary } from "../types";
import * as api from "../api/commands";
import { useUiStore } from "./uiStore";
import { useChatStore } from "./chatStore";
import { useCharacterStore } from "./characterStore";

interface ConversationState {
  items: ConversationSummary[];
  selectedId: string | null;
  loading: boolean;
  /** 多选选中的对话 id 集合 */
  selectedIds: string[];

  loadForCharacter: (characterId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  /** greetingIndex 不传 = 自动轮流（会话内记忆游标） */
  create: (characterId: string, greetingIndex?: number) => Promise<ConversationSummary | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;

  // 多选
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  /** 批量删除选中对话 */
  batchRemove: (ids: string[]) => Promise<void>;

  // 拖拽排序
  reorderLocally: (ids: string[]) => void;
  commitReorder: () => Promise<void>;
}

// 开场白轮流游标（会话级记忆，显式选择会推进游标）
const greetingCursor: Record<string, number> = {};

export const useConversationStore = create<ConversationState>((set, get) => ({
  items: [],
  selectedId: null,
  loading: false,
  selectedIds: [],

  loadForCharacter: async (characterId) => {
    if (!characterId) {
      set({ items: [], selectedId: null, selectedIds: [] });
      useChatStore.getState().reset();
      return;
    }
    set({ loading: true });
    try {
      const items = await api.listConversations(characterId);
      set({ items });
      // 角色切换后若当前选中的对话不属于该角色，清空选中
      const { selectedId } = get();
      if (selectedId && !items.some((c) => c.id === selectedId)) {
        set({ selectedId: null });
        useChatStore.getState().reset();
      }
    } catch (e) {
      useUiStore.getState().showToast(`加载对话失败: ${e}`);
    } finally {
      set({ loading: false });
    }
  },

  /** 刷新当前角色的对话列表（标题/消息数/排序变化后调用） */
  refresh: async () => {
    const charId = useCharacterStore.getState().selectedId;
    if (charId) await get().loadForCharacter(charId);
  },

  select: (id) => {
    set({ selectedId: id });
    // 记录上次对话（自动加载设置用）
    const conv = get().items.find((c) => c.id === id);
    if (conv) {
      localStorage.setItem("brochat.lastConversation", `${conv.character_id}|${id}`);
    }
    // 回复计时器按对话归属，切换后清空
    useChatStore.setState({ lastReplyMs: null });
    useChatStore.getState().load(id);
  },

  create: async (characterId, greetingIndex) => {
    try {
      // 记录发起时选中的角色；等待期间用户手动切换则不再抢回选中
      const charAtStart = useCharacterStore.getState().selectedId;
      let index = greetingIndex;
      if (index === undefined) {
        // 自动轮流：取角色开场白数，游标 +1
        try {
          const c = await useCharacterStore.getState().fetchOne(characterId);
          const msgs = c.first_messages.filter((s) => s.trim());
          if (msgs.length > 1) {
            const cur = greetingCursor[characterId] ?? 0;
            index = cur % msgs.length;
            greetingCursor[characterId] = cur + 1;
          }
        } catch {
          // 拿不到开场白就默认第一条
        }
      }
      const conv = await api.createConversation(characterId, index);
      if (useCharacterStore.getState().selectedId !== charAtStart) {
        return conv; // 用户已切走，不抢回
      }
      await get().loadForCharacter(characterId);
      set({ selectedId: conv.id });
      useChatStore.getState().load(conv.id);
      return conv;
    } catch (e) {
      useUiStore.getState().showToast(`创建对话失败: ${e}`);
      return null;
    }
  },

  remove: async (id) => {
    try {
      await api.deleteConversation(id);
      const { selectedId } = get();
      if (selectedId === id) {
        set({ selectedId: null });
        useChatStore.getState().reset();
      }
      const charId = useCharacterIdOf(id);
      if (charId) await get().loadForCharacter(charId);
    } catch (e) {
      useUiStore.getState().showToast(`删除对话失败: ${e}`);
    }
  },

  rename: async (id, title) => {
    try {
      await api.renameConversation(id, title);
      set({
        items: get().items.map((c) => (c.id === id ? { ...c, title } : c)),
      });
    } catch (e) {
      useUiStore.getState().showToast(`重命名失败: ${e}`);
    }
  },

  // ---- 多选 ----

  toggleSelect: (id) => {
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    }));
  },

  clearSelection: () => set({ selectedIds: [] }),

  setSelection: (ids) => set({ selectedIds: ids }),

  batchRemove: async (ids) => {
    try {
      for (const id of ids) {
        await api.deleteConversation(id);
      }
      const { selectedId } = get();
      if (selectedId && ids.includes(selectedId)) {
        set({ selectedId: null });
        useChatStore.getState().reset();
      }
      set({ selectedIds: [] });
      const charId = useCharacterStore.getState().selectedId;
      if (charId) await get().loadForCharacter(charId);
    } catch (e) {
      useUiStore.getState().showToast(`删除失败: ${e}`);
    }
  },

  // ---- 拖拽排序 ----

  reorderLocally: (ids) => {
    const byId = new Map(get().items.map((c) => [c.id, c]));
    const reordered = ids
      .map((id) => byId.get(id))
      .filter((x): x is ConversationSummary => !!x);
    set({ items: reordered });
  },

  commitReorder: async () => {
    const charId = useCharacterStore.getState().selectedId;
    if (!charId) return;
    try {
      await api.reorderConversations(charId, get().items.map((c) => c.id));
    } catch (e) {
      useUiStore.getState().showToast(`保存排序失败: ${e}`);
      await get().loadForCharacter(charId); // 回滚
    }
  },
}));

// 找到某对话所属角色（从当前列表）
function useCharacterIdOf(conversationId: string): string | null {
  const conv = useConversationStore.getState().items.find((c) => c.id === conversationId);
  return conv?.character_id ?? null;
}
