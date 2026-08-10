import { create } from "zustand";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Character, CharacterInput, CharacterSummary } from "../types";
import * as api from "../api/commands";
import { useUiStore } from "./uiStore";

interface CharacterState {
  items: CharacterSummary[];
  selectedId: string | null;
  search: string;
  loading: boolean;
  /** 多选选中的角色 id 集合（框选/多选模式） */
  selectedIds: string[];

  load: () => Promise<void>;
  select: (id: string | null) => void;
  setSearch: (s: string) => void;
  /** 返回完整角色（编辑用） */
  fetchOne: (id: string) => Promise<Character>;
  /** id 为空 = 新建 */
  save: (id: string | null, input: CharacterInput) => Promise<Character>;
  remove: (id: string) => Promise<void>;
  importFromFile: () => Promise<void>;
  exportToFile: (id: string) => Promise<void>;

  // 多选
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  /** 批量删除选中角色 */
  batchRemove: (ids: string[]) => Promise<void>;

  // 拖拽排序
  /** 本地按 id 顺序重排（拖拽中实时） */
  reorderLocally: (ids: string[]) => void;
  /** 持久化当前顺序 */
  commitReorder: () => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  items: [],
  selectedId: null,
  search: "",
  loading: false,
  selectedIds: [],

  load: async () => {
    set({ loading: true });
    try {
      const items = await api.listCharacters();
      set({ items });
    } catch (e) {
      useUiStore.getState().showToast(`加载角色失败: ${e}`);
    } finally {
      set({ loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),

  setSearch: (s) => set({ search: s }),

  fetchOne: async (id) => {
    try {
      return await api.getCharacter(id);
    } catch (e) {
      useUiStore.getState().showToast(`读取角色失败: ${e}`);
      throw e;
    }
  },

  save: async (id, input) => {
    const saved = id ? await api.updateCharacter(id, input) : await api.createCharacter(input);
    await get().load();
    set({ selectedId: saved.id });
    return saved;
  },

  remove: async (id) => {
    try {
      await api.deleteCharacter(id);
      const { selectedId } = get();
      if (selectedId === id) set({ selectedId: null });
      await get().load();
    } catch (e) {
      useUiStore.getState().showToast(`删除角色失败: ${e}`);
    }
  },

  importFromFile: async () => {
    const path = await open({
      multiple: false,
      title: "导入角色卡",
      filters: [
        { name: "角色卡", extensions: ["png", "json"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (typeof path !== "string") return;
    try {
      const c = await api.importCard(path);
      await get().load();
      set({ selectedId: c.id });
      useUiStore.getState().showToast(`已导入「${c.name}」`);
    } catch (e) {
      useUiStore.getState().showToast(`导入失败: ${e}`);
    }
  },

  exportToFile: async (id) => {
    const c = await get().fetchOne(id);
    // 有 PNG 头像 → PNG 卡，否则 JSON 卡
    const isPng = c.avatar?.startsWith("data:image/png;") ?? false;
    const ext = isPng ? "png" : "json";
    const path = await save({
      title: "导出角色卡",
      defaultPath: `${c.name}.${ext}`,
      filters: [{ name: "角色卡", extensions: [ext] }],
    });
    if (!path) return;
    try {
      await api.exportCard(id, path);
      useUiStore.getState().showToast(`已导出「${c.name}」`);
    } catch (e) {
      useUiStore.getState().showToast(`导出失败: ${e}`);
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
        await api.deleteCharacter(id);
      }
      const { selectedId } = get();
      if (selectedId && ids.includes(selectedId)) set({ selectedId: null });
      set({ selectedIds: [] });
      await get().load();
    } catch (e) {
      useUiStore.getState().showToast(`删除失败: ${e}`);
    }
  },

  // ---- 拖拽排序 ----

  reorderLocally: (ids) => {
    const byId = new Map(get().items.map((c) => [c.id, c]));
    const reordered = ids.map((id) => byId.get(id)).filter((x): x is CharacterSummary => !!x);
    set({ items: reordered });
  },

  commitReorder: async () => {
    try {
      await api.reorderCharacters(get().items.map((c) => c.id));
    } catch (e) {
      useUiStore.getState().showToast(`保存排序失败: ${e}`);
      await get().load(); // 回滚
    }
  },
}));
