import { useCharacterStore } from "../stores/characterStore";
import { useConversationStore } from "../stores/conversationStore";
import ConversationListItem from "./ConversationListItem";

// 中栏：选中角色的对话列表 + 新建对话
export default function ConversationPanel() {
  const selectedCharId = useCharacterStore((s) => s.selectedId);
  const selectedCharName = useCharacterStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.name,
  );
  const { items, selectedId, create, select } = useConversationStore();

  if (!selectedCharId) {
    return (
      <aside className="flex flex-col border-r border-neutral-200 dark:border-neutral-700">
        <header className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-700">
          对话
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-neutral-400">
          先选择一个角色
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
        <h2 className="truncate text-sm font-semibold">{selectedCharName}</h2>
        <button
          onClick={() => create(selectedCharId)}
          className="rounded-md bg-neutral-800 px-2 py-1 text-[11px] text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
        >
          ＋ 新对话
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            还没有对话
            <br />
            点「新对话」开始
          </div>
        ) : (
          items.map((c) => (
            <ConversationListItem
              key={c.id}
              summary={c}
              selected={c.id === selectedId}
              onSelect={() => select(c.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
