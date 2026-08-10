import { useState } from "react";
import type { ConversationSummary } from "../types";
import { useConversationStore } from "../stores/conversationStore";
import { useUiStore } from "../stores/uiStore";
import { formatTime } from "../utils/format";

// 对话列表项：标题 + 时间 + 消息数；悬停显示重命名/删除
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
      className={`group mb-1 cursor-pointer rounded-lg px-2 py-1.5 text-xs ${
        selected
          ? "bg-neutral-200 dark:bg-neutral-700"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
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
          className="w-full rounded border border-neutral-400 bg-white px-1.5 py-0.5 text-xs outline-none dark:bg-neutral-800"
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">{summary.title}</span>
          <span className="shrink-0 text-[10px] text-neutral-400">
            {summary.message_count > 0 && `${summary.message_count} 条`}
          </span>
          <span className="hidden shrink-0 text-[10px] text-neutral-400 group-hover:inline">
            {formatTime(summary.updated_at)}
          </span>
          <span className="hidden shrink-0 gap-0.5 group-hover:flex">
            <button
              title="重命名"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(summary.title);
                setEditing(true);
              }}
              className="rounded px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600"
            >
              ✎
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
              className="rounded px-1 text-neutral-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40"
            >
              ✕
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
