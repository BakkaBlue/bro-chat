import { useRef, useState } from "react";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";

// 输入区：Enter 发送（可设置模式）、Shift+Enter 换行；生成中变停止按钮。
// 中文输入法组合（IME）期间的 Enter 不应触发发送。
export default function ChatInput() {
  const [text, setText] = useState("");
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const streaming = useChatStore((s) => s.streaming);
  const enterMode = useSettingsStore((s) => s.settings?.chat_enter_mode ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !streaming;
  // newline 模式：Enter 换行、Ctrl+Enter 发送；其他模式：Enter 发送
  const enterSends = enterMode !== "newline";

  const submit = () => {
    if (!canSend) return;
    send(text);
    setText("");
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

  return (
    <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={
            enterSends ? "输入消息，Enter 发送，Shift+Enter 换行" : "输入消息，Ctrl+Enter 发送，Enter 换行"
          }
          className="max-h-40 min-h-10 flex-1 resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800"
        />
        {streaming ? (
          <button
            onClick={stop}
            className="shrink-0 rounded-lg border border-rose-300 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
          >
            停止
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            className="shrink-0 rounded-lg bg-neutral-800 px-4 py-2 text-xs text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
