import { useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useConversationStore } from "../stores/conversationStore";

// 输入区：Enter 发送（可设置模式）、Shift+Enter 换行；生成中变停止按钮。
// 中文输入法组合（IME）期间的 Enter 不应触发发送。
// 停止/发送守卫按"当前对话"判断，不被其他对话的流锁死。
export default function ChatInput() {
  const [text, setText] = useState("");
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const streaming = useChatStore((s) => s.streaming);
  const sending = useChatStore((s) => s.sending);
  const enterMode = useSettingsStore((s) => s.settings?.chat_enter_mode ?? "");
  const convId = useConversationStore((s) => s.selectedId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const streamingHere = streaming !== null && streaming.conversationId === convId;
  const canSend = text.trim().length > 0 && !streamingHere && !sending;
  // newline 模式：Enter 换行、Ctrl+Enter 发送；其他模式：Enter 发送
  const enterSends = enterMode !== "newline";

  const submit = async () => {
    if (!canSend) return;
    // 发送失败时不丢输入内容
    const ok = await send(text);
    if (ok) {
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // IME 组合中
    if (e.key === "Enter") {
      if (enterSends && !e.shiftKey) {
        e.preventDefault();
        submit();
      } else if (!enterSends && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    }
  };

  // 输入自适应高度（最多 8 行）
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 8 * 20 + 16)}px`;
  };

  return (
    <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={
            enterSends ? "输入消息，Enter 发送，Shift+Enter 换行" : "输入消息，Ctrl+Enter 发送，Enter 换行"
          }
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[13px] outline-none placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/20 dark:border-neutral-600 dark:bg-neutral-800"
        />
        {streamingHere ? (
          <button
            onClick={stop}
            title="停止生成"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300 text-rose-500 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            title="发送"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-white transition-colors hover:bg-neutral-700 disabled:opacity-35 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
