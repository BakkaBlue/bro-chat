import { useEffect, useMemo, useRef } from "react";
import { Settings, Trash2, Upload, UserPlus, X } from "lucide-react";
import { useCharacterStore } from "../stores/characterStore";
import { useUiStore } from "../stores/uiStore";
import CharacterListItem from "./CharacterListItem";
import { useBoxSelect } from "../hooks/useBoxSelect";
import { useDragSort } from "../hooks/useDragSort";

// 角色库侧边栏：搜索 + 角色列表 + 底部操作。
// 交互：拖拽排序（搜索时禁用）；空白区拖拽框选多选 → 批量删除。
export default function Sidebar() {
  const {
    items,
    selectedId,
    search,
    setSearch,
    load,
    select,
    importFromFile,
    selectedIds,
    toggleSelect,
    clearSelection,
    setSelection,
    batchRemove,
    reorderLocally,
    commitReorder,
  } = useCharacterStore();
  const openEditor = useUiStore((s) => s.openEditor);
  const setView = useUiStore((s) => s.setView);
  const askConfirm = useUiStore((s) => s.askConfirm);

  const listRef = useRef<HTMLDivElement>(null);

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

  const multiSelect = selectedIds.length > 0;
  const dragEnabled = search.trim() === ""; // 搜索过滤视图下禁用拖拽

  // 框选
  const getItemEl = (i: number) =>
    listRef.current?.querySelectorAll("[data-sortable]")[i] as HTMLElement | null;
  const { box, onMouseDown } = useBoxSelect({
    containerRef: listRef,
    itemCount: filtered.length,
    getItemEl,
    onSelectRange: (indices) => setSelection(indices.map((i) => filtered[i].id)),
  });

  // 拖拽排序
  const { dragIndex, itemProps } = useDragSort(
    filtered,
    (arr) => reorderLocally(arr.map((x) => x.id)),
    () => commitReorder(),
  );

  const handleItemClick = (id: string) => {
    if (multiSelect) {
      toggleSelect(id);
    } else {
      select(id);
    }
  };

  const doBatchRemove = () => {
    askConfirm(
      `删除选中的 ${selectedIds.length} 个角色？`,
      "这些角色的全部对话也会一并删除，且无法恢复。",
      () => batchRemove(selectedIds),
    );
  };

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
          className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <div
        ref={listRef}
        onMouseDown={onMouseDown}
        className="relative min-h-0 flex-1 select-none overflow-y-auto p-2"
      >
        {multiSelect && (
          <div className="selection-bar-anim sticky top-0 z-10 mb-1.5 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/95 px-2.5 py-1.5 dark:border-indigo-900 dark:bg-indigo-950/90">
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
              已选 {selectedIds.length} 个角色
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={doBatchRemove}
                className="flex items-center gap-1 rounded-md bg-rose-500 px-2 py-1 text-[10px] text-white hover:bg-rose-400"
              >
                <Trash2 className="size-3" />
                删除
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[10px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
              >
                <X className="size-3" />
                取消
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            {items.length === 0 ? "还没有角色\n点下方「导入」或「新建」" : "没有匹配的角色"}
          </div>
        ) : (
          filtered.map((c, i) => {
            const multiSel = selectedIds.includes(c.id);
            const dragging = dragIndex === i;
            return (
              <div
                key={c.id}
                data-sortable
                {...(dragEnabled ? itemProps(i) : { draggable: false })}
                className={`cursor-grab transition-all active:cursor-grabbing ${
                  dragging ? "opacity-40" : ""
                } ${multiSel ? "rounded-lg ring-2 ring-indigo-400/70" : ""}`}
              >
                <CharacterListItem
                  summary={c}
                  selected={c.id === selectedId}
                  onSelect={() => handleItemClick(c.id)}
                />
              </div>
            );
          })
        )}

        {/* 框选矩形 */}
        {box && (
          <div
            className="pointer-events-none fixed z-50 rounded border border-indigo-400 bg-indigo-400/10"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
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
