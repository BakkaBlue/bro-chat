import { create } from "zustand";

interface UiState {
  view: "main" | "settings";
  editorOpen: "create" | { id: string } | null;
  /** 世界书弹窗打开的角色 id（独立入口） */
  worldbookOpen: string | null;
  confirm: { title: string; message: string; onConfirm: () => void } | null;
  toast: string | null;
  toastTimer: ReturnType<typeof setTimeout> | null;

  setView: (v: "main" | "settings") => void;
  openEditor: (t: "create" | { id: string }) => void;
  closeEditor: () => void;
  openWorldbook: (characterId: string) => void;
  closeWorldbook: () => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  resolveConfirm: () => void;
  dismissConfirm: () => void;
  showToast: (msg: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  view: "main",
  editorOpen: null,
  worldbookOpen: null,
  confirm: null,
  toast: null,
  toastTimer: null,

  setView: (v) => set({ view: v }),

  openEditor: (t) => set({ editorOpen: t }),
  closeEditor: () => set({ editorOpen: null }),

  openWorldbook: (characterId) => set({ worldbookOpen: characterId }),
  closeWorldbook: () => set({ worldbookOpen: null }),

  askConfirm: (title, message, onConfirm) => set({ confirm: { title, message, onConfirm } }),
  resolveConfirm: () => {
    const { confirm } = get();
    if (!confirm) return;
    set({ confirm: null });
    confirm.onConfirm();
  },
  dismissConfirm: () => set({ confirm: null }),

  showToast: (msg) => {
    const { toastTimer } = get();
    if (toastTimer) clearTimeout(toastTimer);
    set({
      toast: msg,
      toastTimer: setTimeout(() => set({ toast: null }), 4000),
    });
  },
}));
