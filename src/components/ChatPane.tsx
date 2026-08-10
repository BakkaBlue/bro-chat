import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../stores/chatStore";
import { useConversationStore } from "../stores/conversationStore";
import { useCharacterStore } from "../stores/characterStore";
import { useSettingsStore } from "../stores/settingsStore";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

// 右栏：对话头部 + 消息列表 + 输入区
export default function ChatPane() {
  const { messages, loading, lastError, streaming } = useChatStore();
  const convId = useConversationStore((s) => s.selectedId);
  const convTitle = useConversationStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.title,
  );
  const charName = useCharacterStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.name,
  );
  const model = useSettingsStore((s) => s.settings?.model);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const streamingText = streaming?.conversationId === convId ? streaming.text : null;
  const streamingActive = streaming !== null && streaming.conversationId === convId;

  // 新内容时自动滚底（用户上滚时不打扰）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, stickToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  if (!convId) {
    return (
      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutral-400">
          {charName ? "选择或新建一个对话开始聊天" : "选择一个角色开始聊天"}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{convTitle}</h2>
          <p className="truncate text-[11px] text-neutral-400">
            {charName} {model ? `· ${model}` : ""}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {loading && messages.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400">加载中…</div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-400">
            发送第一条消息开始对话
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streamingActive && (
              <MessageBubble
                message={{
                  id: `streaming-${streaming?.requestId}`,
                  conversation_id: convId,
                  role: "assistant",
                  content: streamingText ?? "",
                  seq: 0,
                  created_at: new Date().toISOString(),
                }}
                streaming={true}
                thinking={!streamingText}
              />
            )}
          </div>
        )}
        {lastError && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-300">
            {lastError}
            <button
              className="ml-2 underline"
              onClick={() => useChatStore.setState({ lastError: null })}
            >
              知道了
            </button>
          </div>
        )}
      </div>

      <ChatInput />
    </main>
  );
}
