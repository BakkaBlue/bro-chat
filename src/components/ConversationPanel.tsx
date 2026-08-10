import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useCharacterStore } from "../stores/characterStore";
import { useConversationStore } from "../stores/conversationStore";
import { useUiStore } from "../stores/uiStore";
import ConversationListItem from "./ConversationListItem";
import { useBoxSelect } from "../hooks/useBoxSelect";
import { useDragSort } from "../hooks/useDragSort";

// 中栏：选中角色的对话列表 + 新建对话（▼ 可选开场白，默认自动轮流）。
// 交互：拖拽排序；空白区框选多选 → 批量删除。
export default function ConversationPanel() {
  const selectedCharId = useCharacterStore((s) => s.selectedId);
  const selectedCharName = useCharacterStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.name,
  );
  const {
    items,
    selectedId,
    create,
    select,
    selectedIds,
    toggleSelect,
    clearSelection,
    setSelection,
    batchRemove,
    reorderLocally,
    commitReorder,
  } = useConversationStore();
  const askConfirm = useUiStore((s) => s.askConfirm);

  const [menuOpen, setMenuOpen] = useState(false);
  const [greetings, setGreetings] = useState<string[] | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const multiSelect = selectedIds.length > 0;

  // 框选
  const getItemEl = (i: number) =>
    listRef.current?.querySelectorAll("[data-sortable]")[i] as HTMLElement | null;
  const { box, onMouseDown } = useBoxSelect({
    containerRef: listRef,
    itemCount: items.length,
    getItemEl,
    onSelectRange: (indices) => setSelection(indices.map((i) => items[i].id)),
  });

  // 拖拽排序
  const { dragIndex, itemProps } = useDragSort(
    items,
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
      `删除选中的 ${selectedIds.length} 个对话？`,
      "对话内的全部消息将一并删除，且无法恢复。",
      () => batchRemove(selectedIds),
    );
  };

  if (!selectedCharId) {
    return (
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
        <h2 className="truncate text-sm font-semibold">{selectedCharName}</h2>
        <div className="flex items-center">
          <button
            onClick={() => create(selectedCharId)}
            title="新建对话（自动轮流开场白）"
            className="flex items-center gap-1 rounded-l-lg bg-neutral-800 px-2.5 py-1.5 text-[11px] text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            <Plus className="size-3.5" />
            新对话
          </button>
          <div ref={menuRef} className="relative">
            <button
              onClick={openMenu}
              title="选择开场白"
              className="flex h-full items-center rounded-r-lg border-l border-neutral-600 bg-neutral-800 px-1.5 py-1.5 text-white hover:bg-neutral-700 dark:border-neutral-400 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
            >
              <ChevronDown className="size-3.5" />
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

      <div
        ref={listRef}
        onMouseDown={onMouseDown}
        className="relative min-h-0 flex-1 select-none overflow-y-auto p-2"
      >
        {multiSelect && (
          <div className="selection-bar-anim sticky top-0 z-10 mb-1.5 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/95 px-2.5 py-1.5 dark:border-indigo-900 dark:bg-indigo-950/90">
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
              已选 {selectedIds.length} 个对话
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

        {items.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            还没有对话
            <br />
            点「新对话」开始
          </div>
        ) : (
          items.map((c, i) => {
            const multiSel = selectedIds.includes(c.id);
            const dragging = dragIndex === i;
            return (
              <div
                key={c.id}
                data-sortable
                {...itemProps(i)}
                className={`cursor-grab transition-all active:cursor-grabbing ${
                  dragging ? "opacity-40" : ""
                } ${multiSel ? "rounded-lg ring-2 ring-indigo-400/70" : ""}`}
              >
                <ConversationListItem
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
    </aside>
  );
}
