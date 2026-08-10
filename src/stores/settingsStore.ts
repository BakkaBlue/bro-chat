import { create } from "zustand";
import type { Settings } from "../types";
import * as api from "../api/commands";
import { useUiStore } from "./uiStore";

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  /** 背景图片（data URL，存 localStorage；配合背景高斯模糊使用） */
  bgImage: string | null;
  load: () => Promise<void>;
  save: (s: Settings) => Promise<void>;
  setBgImage: (v: string | null) => void;
}

const BG_KEY = "brochat.bgImage";

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  bgImage: localStorage.getItem(BG_KEY),

  load: async () => {
    set({ loading: true });
    try {
      const settings = await api.getSettings();
      set({ settings });
    } catch (e) {
      useUiStore.getState().showToast(`读取设置失败: ${e}`);
    } finally {
      set({ loading: false });
    }
  },

  save: async (s) => {
    try {
      await api.updateSettings(s);
      set({ settings: s });
      useUiStore.getState().showToast("设置已保存，下次发送生效");
    } catch (e) {
      useUiStore.getState().showToast(`保存设置失败: ${e}`);
    }
  },

  setBgImage: (v) => {
    if (v) {
      localStorage.setItem(BG_KEY, v);
    } else {
      localStorage.removeItem(BG_KEY);
    }
    set({ bgImage: v });
  },
}));
