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
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  items: [],
  selectedId: null,
  search: "",
  loading: false,

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
}));
