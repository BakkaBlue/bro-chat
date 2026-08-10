import { useState } from "react";
import type { Message } from "../types";
import { estimateTokens, renderMarkdown } from "../utils/markdown";
import { formatTime } from "../utils/format";
import { useSettingsStore } from "../stores/settingsStore";
import { useChatStore } from "../stores/chatStore";

// 单条消息气泡：user 右侧、assistant 左侧 + Markdown 渲染。
// 悬停显示操作（复制/重新生成）；可开关：时间戳/楼层号/Token 数/单击编辑/菜单常显。
export default function MessageBubble({
  message,
  streaming = false,
  thinking = false,
  canRegenerate = false,
  onRegenerate,
  canResend = false,
  onResend,
}: {
  message: Message;
  streaming?: boolean;
  thinking?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  canResend?: boolean;
  onResend?: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const editMessage = useChatStore((s) => s.editMessage);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isUser = message.role === "user";
  const showTimestamps = settings?.ui_show_timestamps ?? true;
  const showFloor = settings?.ui_show_floor ?? false;
  const showTokens = settings?.ui_show_token_count ?? false;
  const clickToEdit = settings?.ui_click_to_edit ?? false;
  const alwaysActions = settings?.ui_auto_expand_actions ?? false;
  const blockExternal = settings?.chat_block_external_media ?? false;
  const floor = message.seq;

  const copy = () => {
    navigator.clipboard.writeText(message.content).catch(() => {});
  };

  const submitEdit = () => {
    const content = draft.trim();
    if (content && content !== message.content) {
      editMessage(message.id, content);
    }
    setEditing(false);
  };

  const actionBar = (
    <div
      className={`mt-1 flex items-center justify-end gap-2 transition-opacity ${
        alwaysActions ? "" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      <button
        onClick={copy}
        title="复制消息"
        className="rounded px-1 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
      >
        复制
      </button>
      {isUser && canResend && (
        <button
          onClick={onResend}
          title="重新发送这条消息（截断其后内容）"
          className="rounded px-1 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
        >
          ↻ 重新发送
        </button>
      )}
      {!isUser && canRegenerate && (
        <button
          onClick={onRegenerate}
          title="重新生成这条回复"
          className="rounded px-1 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
        >
          ↻ 重新生成
        </button>
      )}
      <span className="flex items-center gap-1.5">
        {showTokens && (
          <span className="text-[10px] text-neutral-300 dark:text-neutral-500">
            ≈{estimateTokens(message.content)}
          </span>
        )}
        {showTimestamps && (
          <span className="text-[10px] text-neutral-300 dark:text-neutral-500">
            {formatTime(message.created_at)}
          </span>
        )}
      </span>
    </div>
  );

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`msg-bubble max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "rounded-br-md bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
            : "rounded-bl-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
        }`}
      >
        {isUser ? (
          clickToEdit && !streaming ? (
            editing ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={submitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                rows={Math.max(1, draft.split("\n").length)}
                className="w-full resize-none bg-transparent outline-none"
              />
            ) : (
              <p
                className="cursor-text whitespace-pre-wrap break-words"
                title="点击编辑（Enter 保存）"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                {showFloor && <span className="mr-1.5 opacity-40">{floor}</span>}
                {message.content}
              </p>
            )
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words">
                {showFloor && <span className="mr-1.5 opacity-40">{floor}</span>}
                {message.content}
              </p>
              {!streaming && actionBar}
            </>
          )
        ) : thinking ? (
          <div className="flex items-center gap-1.5 py-0.5 text-neutral-400">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            <span className="ml-1 text-[11px]">正在思考…</span>
          </div>
        ) : (
          <>
            <div
              className="prose prose-sm dark:prose-invert max-w-none break-words [font-size:var(--msg-font-size)] [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-neutral-100 [&_pre]:p-2 dark:[&_pre]:bg-neutral-900"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(message.content, blockExternal),
              }}
            />
            {streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-neutral-400 align-text-bottom" />
            )}
            {!streaming && actionBar}
          </>
        )}
      </div>
    </div>
  );
}
