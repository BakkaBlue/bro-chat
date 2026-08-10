import { BookOpenText, Download, Pencil, Trash2 } from "lucide-react";
import type { CharacterSummary } from "../types";
import { useCharacterStore } from "../stores/characterStore";
import { useUiStore } from "../stores/uiStore";
import { useSettingsStore } from "../stores/settingsStore";

// 角色列表项：头像 + 名称 + 标签；悬停显示导出/编辑/删除
export default function CharacterListItem({
  summary,
  selected,
  onSelect,
}: {
  summary: CharacterSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const exportToFile = useCharacterStore((s) => s.exportToFile);
  const remove = useCharacterStore((s) => s.remove);
  const openEditor = useUiStore((s) => s.openEditor);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const openWorldbook = useUiStore((s) => s.openWorldbook);
  const showVersion = useSettingsStore((s) => s.settings?.char_show_version ?? false);

  return (
    <div
      onClick={onSelect}
      className={`group mb-1 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs ${
        selected
          ? "bg-neutral-200 dark:bg-neutral-700"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-200 text-[10px] text-neutral-500 dark:bg-neutral-700">
        {summary.avatar ? (
          <img
            src={summary.avatar}
            alt={summary.name}
            className="size-full object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : (
          summary.name.charAt(0)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{summary.name}</span>
          {summary.nsfw && (
            <span className="rounded bg-rose-500/15 px-1 text-[9px] font-bold text-rose-500">
              NSFW
            </span>
          )}
        </div>
        {summary.tags.length > 0 && (
          <div className="truncate text-[10px] text-neutral-400">
            {summary.tags.slice(0, 3).join(" · ")}
          </div>
        )}
        {showVersion && summary.character_version && (
          <div className="text-[10px] text-neutral-400">v{summary.character_version}</div>
        )}
      </div>
      <div className="hidden shrink-0 gap-0.5 group-hover:flex">
        <button
          title="世界书"
          onClick={(e) => {
            e.stopPropagation();
            openWorldbook(summary.id);
          }}
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600"
        >
          <BookOpenText className="size-3.5" />
        </button>
        <button
          title="导出卡片"
          onClick={(e) => {
            e.stopPropagation();
            exportToFile(summary.id);
          }}
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600"
        >
          <Download className="size-3.5" />
        </button>
        <button
          title="编辑"
          onClick={(e) => {
            e.stopPropagation();
            openEditor({ id: summary.id });
          }}
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          title="删除"
          onClick={(e) => {
            e.stopPropagation();
            askConfirm(
              `删除角色「${summary.name}」？`,
              "该角色的全部对话也会一并删除，且无法恢复。",
              () => remove(summary.id),
            );
          }}
          className="rounded-md p-1 text-neutral-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
