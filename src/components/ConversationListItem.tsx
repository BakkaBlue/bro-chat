import { useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ConversationSummary } from "../types";
import { useConversationStore } from "../stores/conversationStore";
import { useUiStore } from "../stores/uiStore";
import { formatTime } from "../utils/format";

// 对话列表项：拖拽手柄 + 标题 + 消息数/时间；操作按钮常驻占位（hover 切换可见性）。
export default function ConversationListItem({
  summary,
  selected,
  onSelect,
}: {
  summary: ConversationSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const remove = useConversationStore((s) => s.remove);
  const rename = useConversationStore((s) => s.rename);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary.title);

  const submitRename = () => {
    const title = draft.trim() || summary.title;
    if (title !== summary.title) rename(summary.id, title);
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-1.5 text-xs transition-colors ${
        selected
          ? "bg-neutral-200 dark:bg-neutral-700"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {/* 拖拽手柄 */}
      <span
        className="drag-handle shrink-0 cursor-grab text-neutral-300 transition-colors group-hover:text-neutral-500 active:cursor-grabbing dark:text-neutral-600 dark:group-hover:text-neutral-400"
        title="拖拽排序"
      >
        <GripVertical className="size-3.5" />
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-neutral-400 bg-white px-1.5 py-0.5 text-xs outline-none dark:bg-neutral-800"
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">{summary.title}</span>
          <span className="shrink-0 text-[10px] text-neutral-400">
            {summary.message_count > 0 && `${summary.message_count} 条`}
            {summary.message_count > 0 && " · "}
            {formatTime(summary.updated_at)}
          </span>
        </div>
      )}

      {/* 操作按钮：常驻占位，hover 切换可见性 */}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            title="重命名"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(summary.title);
              setEditing(true);
            }}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600"
          >
            <Pencil className="size-3" />
          </button>
          <button
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              askConfirm(
                `删除对话「${summary.title}」？`,
                "对话内的全部消息将一并删除，且无法恢复。",
                () => remove(summary.id),
              );
            }}
            className="rounded-md p-1 text-neutral-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
