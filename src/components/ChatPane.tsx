import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../stores/chatStore";
import { useConversationStore } from "../stores/conversationStore";
import { useCharacterStore } from "../stores/characterStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import * as api from "../api/commands";

// 右栏：对话头部（重载/清理）+ 消息列表 + 输入区
export default function ChatPane() {
  const { messages, loading, lastError, streaming, lastReplyMs, load } = useChatStore();
  const convId = useConversationStore((s) => s.selectedId);
  const convTitle = useConversationStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.title,
  );
  const charName = useCharacterStore(
    (s) => s.items.find((c) => c.id === s.selectedId)?.name,
  );
  const model = useSettingsStore((s) => s.settings?.model);
  const settings = useSettingsStore((s) => s.settings);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const showToast = useUiStore((s) => s.showToast);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const streamingText = streaming?.conversationId === convId ? streaming.text : null;
  const streamingActive = streaming !== null && streaming.conversationId === convId;
  const autoScroll = settings?.chat_auto_scroll ?? true;

  // 最后一条 assistant 回复的 id（只有它可重新生成）
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);
  // 最后一条用户消息的 id（只有它可重新发送）
  const lastUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].id;
    }
    return null;
  }, [messages]);
  const regenerate = useChatStore((s) => s.regenerate);
  const resend = useChatStore((s) => s.resend);

  // 新内容时自动滚底（用户上滚时不打扰）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !autoScroll || !stickToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, stickToBottom, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const clearChat = () => {
    if (!convId) return;
    const doClear = async () => {
      try {
        await api.clearConversation(convId);
        await load(convId);
        useConversationStore.getState().refresh();
        showToast("对话已清理");
      } catch (e) {
        showToast(`清理失败: ${e}`);
      }
    };
    if (settings?.chat_confirm_delete) {
      askConfirm("清空这段对话？", "全部消息将被删除，且无法恢复。", doClear);
    } else {
      doClear();
    }
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
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{convTitle}</h2>
          <p className="truncate text-[11px] text-neutral-400">
            {charName} {model ? `· ${model}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {settings?.ui_reply_timer && lastReplyMs !== null && !streamingActive && (
            <span className="text-[10px] text-neutral-400">⏱ {(lastReplyMs / 1000).toFixed(1)}s</span>
          )}
          <button
            onClick={() => load(convId)}
            title="重新加载聊天"
            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
          >
            ↻
          </button>
          <button
            onClick={clearChat}
            title="清理当前对话"
            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 hover:bg-rose-50 hover:text-rose-500 dark:border-neutral-600 dark:hover:bg-rose-900/20"
          >
            🗑
          </button>
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
              <MessageBubble
                key={m.id}
                message={m}
                canRegenerate={m.role === "assistant" && m.id === lastAssistantId}
                onRegenerate={regenerate}
                canResend={m.role === "user" && m.id === lastUserId}
                onResend={resend}
              />
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
