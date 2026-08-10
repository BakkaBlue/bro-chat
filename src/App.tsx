import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ConversationPanel from "./components/ConversationPanel";
import ChatPane from "./components/ChatPane";
import CharacterEditorModal from "./components/CharacterEditorModal";
import WorldbookModal from "./components/WorldbookModal";
import ConfirmDialog from "./components/ConfirmDialog";
import Toast from "./components/Toast";
import SettingsView from "./components/SettingsView";
import { useCharacterStore } from "./stores/characterStore";
import { useConversationStore } from "./stores/conversationStore";
import { useChatStore } from "./stores/chatStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { onChatEvents } from "./api/events";

// 三栏布局：角色列表 | 对话列表 | 聊天区；设置整窗覆盖。
// 背景层在最底，配合「背景高斯模糊」开关显示毛玻璃效果。
export default function App() {
  const view = useUiStore((s) => s.view);
  const selectedCharId = useCharacterStore((s) => s.selectedId);
  const loadCharacters = useCharacterStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const bgImage = useSettingsStore((s) => s.bgImage);

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
  const uiTheme = settings?.ui_theme;
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
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--msg-font-size",
      `${settings?.ui_font_size ?? 13}px`,
    );
  }, [settings?.ui_font_size]);

  // 界面设置：效果 class 组合
  useEffect(() => {
    const cls = document.getElementById("app-root");
    if (!cls) return;
    const s = settings;
    const list = [
      s?.ui_glass_blur ? "glass-blur" : "",
      s?.ui_text_shadow ? "text-shadow" : "",
      s?.ui_reduce_motion ? "reduce-motion" : "",
      s?.ui_avatar_style === "circle" ? "avatar-circle" : "",
      s?.ui_chat_style === "flat" ? "chat-flat" : "",
      s?.ui_message_animation ? "msg-anim" : "",
      s?.ui_avatar_hover_zoom ? "avatar-hover-zoom" : "",
    ].filter(Boolean);
    cls.className = list.join(" ");
  }, [
    settings?.ui_glass_blur,
    settings?.ui_text_shadow,
    settings?.ui_reduce_motion,
    settings?.ui_avatar_style,
    settings?.ui_chat_style,
    settings?.ui_message_animation,
    settings?.ui_avatar_hover_zoom,
  ]);

  // 自动化：启动后自动加载上次对话
  const charCount = useCharacterStore((s) => s.items.length);
  useEffect(() => {
    if (!settings?.chat_auto_load_last) return;
    if (charCount === 0) return;
    const saved = localStorage.getItem("brochat.lastConversation");
    if (!saved) return;
    const [charId, convId] = saved.split("|");
    const { items } = useCharacterStore.getState();
    if (!charId || !convId || !items.some((c) => c.id === charId)) return;
    useCharacterStore.getState().select(charId);
    const trySelect = (attempt: number) => {
      const convs = useConversationStore.getState().items;
      if (convs.some((c) => c.id === convId)) {
        useConversationStore.getState().select(convId);
      } else if (attempt < 10) {
        setTimeout(() => trySelect(attempt + 1), 100);
      }
    };
    setTimeout(() => trySelect(0), 50);
  }, [settings?.chat_auto_load_last, charCount]);

  const shell = (children: React.ReactNode) => (
    <div
      id="app-root"
      className="relative grid h-screen grid-cols-[288px_260px_1fr] bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {/* 背景层（最底，模糊开关打开时透过毛玻璃面板可见） */}
      <div
        className="bg-layer"
        style={bgImage ? { backgroundImage: `url(${bgImage})` } : undefined}
      />
      {children}
    </div>
  );

  if (view === "settings") {
    return shell(
      <>
        <div className="relative col-span-3 min-h-0 overflow-y-auto">
          <SettingsView />
        </div>
        <Toast />
      </>,
    );
  }

  return shell(
    <>
      <div className="relative min-h-0">
        <Sidebar />
      </div>
      <div className="relative min-h-0">
        <ConversationPanel />
      </div>
      <div className="relative min-h-0">
        <ChatPane />
      </div>

      <CharacterEditorModal />
      <WorldbookModal />
      <ConfirmDialog />
      <Toast />
    </>,
  );
}
