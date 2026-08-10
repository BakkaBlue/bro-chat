import type { Message } from "../types";
import { renderMarkdown } from "../utils/markdown";
import { formatTime } from "../utils/format";

// 单条消息气泡：user 右侧、assistant 左侧 + Markdown 渲染
export default function MessageBubble({
  message,
  streaming = false,
  thinking = false,
}: {
  message: Message;
  streaming?: boolean;
  thinking?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
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
              className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-neutral-100 [&_pre]:p-2 dark:[&_pre]:bg-neutral-900"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
            {streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-neutral-400 align-text-bottom" />
            )}
          </>
        )}
        {!isUser && !thinking && (
          <div className="mt-1 text-right text-[10px] text-neutral-300 dark:text-neutral-500">
            {formatTime(message.created_at)}
          </div>
        )}
      </div>
    </div>
  );
}
