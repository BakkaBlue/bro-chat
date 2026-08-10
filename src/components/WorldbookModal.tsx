import { useUiStore } from "../stores/uiStore";
import { useCharacterStore } from "../stores/characterStore";
import LorebookEditor from "./LorebookEditor";

// 世界书独立弹窗（侧栏 📖 入口打开）
export default function WorldbookModal() {
  const characterId = useUiStore((s) => s.worldbookOpen);
  const closeWorldbook = useUiStore((s) => s.closeWorldbook);
  const charName = useCharacterStore(
    (s) => s.items.find((c) => c.id === characterId)?.name,
  );

  if (!characterId) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
      onClick={closeWorldbook}
    >
      <div
        className="glass-panel max-h-full w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            世界书{charName ? ` · ${charName}` : ""}
          </h2>
          <button
            onClick={closeWorldbook}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
          >
            关闭
          </button>
        </div>
        <LorebookEditor characterId={characterId} />
      </div>
    </div>
  );
}
