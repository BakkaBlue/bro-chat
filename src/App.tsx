import Sidebar from "./components/Sidebar";
import CharacterEditorModal from "./components/CharacterEditorModal";
import ConfirmDialog from "./components/ConfirmDialog";
import Toast from "./components/Toast";
import { useCharacterStore } from "./stores/characterStore";

// 三栏布局：角色列表 | 对话列表 | 聊天区（对话/聊天区在 Stage 3 接入）
export default function App() {
  const selectedId = useCharacterStore((s) => s.selectedId);
  const selected = useCharacterStore((s) =>
    s.items.find((c) => c.id === s.selectedId),
  );

  return (
    <div className="grid h-screen grid-cols-[288px_260px_1fr] bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <Sidebar />

      <aside className="flex flex-col border-r border-neutral-200 dark:border-neutral-700">
        <header className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-700">
          对话
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-neutral-400">
          {selectedId
            ? `「${selected?.name}」的对话列表将在 Stage 3 接入`
            : "先选择一个角色"}
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutral-400">
          选择一个角色开始聊天
        </div>
      </main>

      <CharacterEditorModal />
      <ConfirmDialog />
      <Toast />
    </div>
  );
}
