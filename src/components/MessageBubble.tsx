import type { Message } from "../types";
import { renderMarkdown } from "../utils/markdown";
import { formatTime } from "../utils/format";

// 单条消息气泡：user 右侧、assistant 左侧 + Markdown 渲染。
// assistant 消息悬停显示工具条：复制 / 重新生成（仅最后一条回复）。
export default function MessageBubble({
  message,
  streaming = false,
  thinking = false,
  canRegenerate = false,
  onRegenerate,
}: {
  message: Message;
  streaming?: boolean;
  thinking?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}) {
  const isUser = message.role === "user";

  const copy = () => {
    navigator.clipboard
      .writeText(message.content)
      .catch(() => {});
  };

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "rounded-br-md bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
            : "rounded-bl-md border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
            {streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-neutral-400 align-text-bottom" />
            )}
            {!streaming && (
              <div className="mt-1 flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={copy}
                  title="复制消息"
                  className="rounded px-1 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
                >
                  复制
                </button>
                {canRegenerate && (
                  <button
                    onClick={onRegenerate}
                    title="重新生成这条回复"
                    className="rounded px-1 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700"
                  >
                    ↻ 重新生成
                  </button>
                )}
                <span className="text-[10px] text-neutral-300 dark:text-neutral-500">
                  {formatTime(message.created_at)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
