import { useEffect, useMemo } from "react";
import { Settings, Upload, UserPlus } from "lucide-react";
import { useCharacterStore } from "../stores/characterStore";
import { useUiStore } from "../stores/uiStore";
import CharacterListItem from "./CharacterListItem";

// 角色库侧边栏：搜索 + 角色列表 + 底部操作
export default function Sidebar() {
  const { items, selectedId, search, setSearch, load, select, importFromFile } =
    useCharacterStore();
  const openEditor = useUiStore((s) => s.openEditor);
  const setView = useUiStore((s) => s.setView);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) => c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
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
          filtered.map((c) => (
            <CharacterListItem
              key={c.id}
              summary={c}
              selected={c.id === selectedId}
              onSelect={() => select(c.id)}
            />
          ))
        )}
      </div>

      <footer className="flex gap-1.5 border-t border-neutral-200 p-2 dark:border-neutral-700">
        <button
          onClick={importFromFile}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs hover:bg-neutral-200 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          <Upload className="size-3.5" />
          导入
        </button>
        <button
          onClick={() => openEditor("create")}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-800 px-2 py-1.5 text-xs text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
        >
          <UserPlus className="size-3.5" />
          新建
        </button>
        <button
          onClick={() => setView("settings")}
          title="设置"
          className="flex items-center justify-center rounded-lg border border-neutral-300 px-2 py-1.5 text-xs hover:bg-neutral-200 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          <Settings className="size-3.5" />
        </button>
      </footer>
    </aside>
  );
}
