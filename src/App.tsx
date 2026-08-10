import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ConversationPanel from "./components/ConversationPanel";
import ChatPane from "./components/ChatPane";
import CharacterEditorModal from "./components/CharacterEditorModal";
import ConfirmDialog from "./components/ConfirmDialog";
import Toast from "./components/Toast";
import SettingsView from "./components/SettingsView";
import { useCharacterStore } from "./stores/characterStore";
import { useConversationStore } from "./stores/conversationStore";
import { useChatStore } from "./stores/chatStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { onChatEvents } from "./api/events";

// 三栏布局：角色列表 | 对话列表 | 聊天区；设置整窗覆盖
export default function App() {
  const view = useUiStore((s) => s.view);
  const selectedCharId = useCharacterStore((s) => s.selectedId);
  const loadCharacters = useCharacterStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);

  // 启动：加载角色列表与设置
  useEffect(() => {
    loadCharacters();
    loadSettings();
  }, [loadCharacters, loadSettings]);

  // 角色切换 → 加载对应对话列表
  useEffect(() => {
    useConversationStore.getState().loadForCharacter(selectedCharId);
  }, [selectedCharId]);

  // 注册 chat:* 事件（一次性）
  useEffect(() => {
    const store = useChatStore.getState();
    return onChatEvents({
      onChunk: store.onChunk,
      onDone: store.onDone,
      onError: store.onError,
      onCancelled: store.onCancelled,
    });
  }, []);

  // 界面设置：主题（跟随系统/浅/深）
  const uiTheme = useSettingsStore((s) => s.settings?.ui_theme);
  useEffect(() => {
    const t = uiTheme ?? "system";
    const apply = () => {
      const dark =
        t === "dark" ||
        (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    if (t === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [uiTheme]);

  // 界面设置：消息字号
  const uiFontSize = useSettingsStore((s) => s.settings?.ui_font_size);
  useEffect(() => {
    document.documentElement.style.setProperty("--msg-font-size", `${uiFontSize ?? 13}px`);
  }, [uiFontSize]);

  if (view === "settings") {
    return (
      <div className="h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <SettingsView />
        <Toast />
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[288px_260px_1fr] bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <Sidebar />
      <ConversationPanel />
      <ChatPane />

      <CharacterEditorModal />
      <ConfirmDialog />
      <Toast />
    </div>
  );
}
