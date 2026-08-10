import { useEffect, useMemo, useRef, useState } from "react";
import { useCharacterStore } from "../stores/characterStore";
import { useConversationStore } from "../stores/conversationStore";
import { useUiStore } from "../stores/uiStore";
import CharacterListItem from "./CharacterListItem";
import ConversationListItem from "./ConversationListItem";

// 左侧层级边栏：角色列表 → 展开显示对话列表。可整体收起。
export default function Sidebar() {
  const { items, selectedId, search, setSearch, load, select, importFromFile } =
    useCharacterStore();
  const {
    items: convs,
    selectedId: convSelectedId,
    create,
    select: selectConv,
  } = useConversationStore();
  const openEditor = useUiStore((s) => s.openEditor);
  const setView = useUiStore((s) => s.setView);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // 展开角色的开场白菜单
  const [menuCharId, setMenuCharId] = useState<string | null>(null);
  const [greetings, setGreetings] = useState<string[] | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!menuCharId) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuCharId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuCharId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) => c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [items, search]);

  // 角色点击：展开/收起
  const toggleChar = (id: string) => {
    select(selectedId === id ? null : id);
  };

  const openGreetingMenu = async (charId: string) => {
    if (menuCharId === charId) {
      setMenuCharId(null);
      return;
    }
    try {
      const c = await useCharacterStore.getState().fetchOne(charId);
      setGreetings(c.first_messages.filter((s) => s.trim()));
    } catch {
      setGreetings([]);
    }
    setMenuCharId(charId);
  };

  return (
    <aside className="flex min-h-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
        <button
          onClick={toggleSidebar}
          title="收起边栏"
          className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          ☰
        </button>
        <h1 className="text-sm font-semibold">角色</h1>
        <span className="text-xs text-neutral-400">{items.length}</span>
      </header>

      <div className="border-b border-neutral-200 p-2 dark:border-neutral-700">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索角色或标签…"
          className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            {items.length === 0 ? "还没有角色\n点下方「导入」或「新建」" : "没有匹配的角色"}
          </div>
        ) : (
          filtered.map((c) => {
            const expanded = c.id === selectedId;
            return (
              <div key={c.id}>
                <CharacterListItem
                  summary={c}
                  selected={expanded}
                  onSelect={() => toggleChar(c.id)}
                />
                {expanded && (
                  <div className="ml-4 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                    <div className="mb-0.5 flex items-center justify-between px-1">
                      <span className="text-[10px] text-neutral-400">
                        对话 {convs.length > 0 ? convs.length : ""}
                      </span>
                      <div ref={menuRef} className="relative flex items-center gap-0.5">
                        <button
                          onClick={() => create(c.id)}
                          title="新建对话（自动轮流开场白）"
                          className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
                        >
                          ＋ 新对话
                        </button>
                        <button
                          onClick={() => openGreetingMenu(c.id)}
                          title="选择开场白"
                          className="rounded px-1 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
                        >
                          ▾
                        </button>
                        {menuCharId === c.id && greetings && (
                          <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
                            <button
                              onClick={() => {
                                setMenuCharId(null);
                                create(c.id);
                              }}
                              className="block w-full px-2.5 py-1.5 text-left text-[10px] hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            >
                              ↻ 自动轮流
                            </button>
                            {greetings.length === 0 && (
                              <div className="px-2.5 py-1.5 text-[10px] text-neutral-400">
                                该角色没有开场白
                              </div>
                            )}
                            {greetings.map((g, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setMenuCharId(null);
                                  create(c.id, i);
                                }}
                                className="block w-full truncate border-t border-neutral-100 px-2.5 py-1.5 text-left text-[10px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
                                title={g}
                              >
                                <span className="mr-1 text-neutral-400">{i + 1}.</span>
                                {g.length > 20 ? `${g.slice(0, 20)}…` : g}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {convs.length === 0 ? (
                      <div className="px-1 py-1 text-[10px] text-neutral-400">还没有对话</div>
                    ) : (
                      convs.map((conv) => (
                        <ConversationListItem
                          key={conv.id}
                          summary={conv}
                          selected={conv.id === convSelectedId}
                          onSelect={() => selectConv(conv.id)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <footer className="flex gap-1.5 border-t border-neutral-200 p-2 dark:border-neutral-700">
        <button
          onClick={importFromFile}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-xs hover:bg-neutral-200 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          导入
        </button>
        <button
          onClick={() => openEditor("create")}
          className="flex-1 rounded-md bg-neutral-800 px-2 py-1.5 text-xs text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
        >
          新建角色
        </button>
        <button
          onClick={() => setView("settings")}
          title="设置"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs hover:bg-neutral-200 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          设置
        </button>
      </footer>
    </aside>
  );
}
