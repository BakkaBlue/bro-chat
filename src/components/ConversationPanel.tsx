import { useEffect, useRef, useState } from "react";
import { useCharacterStore } from "../stores/characterStore";
import { useConversationStore } from "../stores/conversationStore";
import ConversationListItem from "./ConversationListItem";

// 中栏：选中角色的对话列表 + 新建对话（▼ 可选开场白，默认自动轮流）
export default function ConversationPanel() {
  const selectedCharId = useCharacterStore((s) => s.selectedId);
  const selectedCharName = useCharacterStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.name,
  );
  const { items, selectedId, create, select } = useConversationStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [greetings, setGreetings] = useState<string[] | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 角色切换时重置开场白菜单（避免显示上一个角色的开场白）
  useEffect(() => {
    setGreetings(null);
    setMenuOpen(false);
  }, [selectedCharId]);

  // 点击菜单外关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const openMenu = async () => {
    if (!selectedCharId) return;
    if (!greetings) {
      try {
        const c = await useCharacterStore.getState().fetchOne(selectedCharId);
        setGreetings(c.first_messages.filter((s) => s.trim()));
      } catch {
        setGreetings([]);
      }
    }
    setMenuOpen((v) => !v);
  };

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
        <div className="flex items-center">
          <button
            onClick={() => create(selectedCharId)}
            title="新建对话（自动轮流开场白）"
            className="rounded-l-md bg-neutral-800 px-2 py-1 text-[11px] text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            ＋ 新对话
          </button>
          <div ref={menuRef} className="relative">
            <button
              onClick={openMenu}
              title="选择开场白"
              className="rounded-r-md border-l border-neutral-600 bg-neutral-800 px-1.5 py-1 text-[11px] text-white hover:bg-neutral-700 dark:border-neutral-400 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
            >
              ▾
            </button>
            {menuOpen && greetings && (
              <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    create(selectedCharId);
                  }}
                  className="block w-full px-3 py-2 text-left text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                  ↻ 自动轮流
                </button>
                {greetings.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-neutral-400">
                    该角色没有开场白
                  </div>
                )}
                {greetings.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setMenuOpen(false);
                      create(selectedCharId, i);
                    }}
                    className="block w-full truncate border-t border-neutral-100 px-3 py-2 text-left text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
                    title={g}
                  >
                    <span className="mr-1.5 text-neutral-400">{i + 1}.</span>
                    {g.length > 24 ? `${g.slice(0, 24)}…` : g}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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
