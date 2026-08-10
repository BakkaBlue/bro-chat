import { useEffect, useState } from "react";
import type { Settings } from "../types";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

const inputCls =
  "w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800";
const labelCls = "mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400";

// 设置整窗：API 连接 + 生成参数 + 全局系统提示词
export default function SettingsView() {
  const { settings, load, save } = useSettingsStore();
  const setView = useUiStore((s) => s.setView);
  const [form, setForm] = useState<Settings | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!settings) load();
  }, [settings, load]);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!form) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-400">
        加载中…
      </div>
    );
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <h1 className="text-sm font-semibold">设置</h1>
        <button
          onClick={() => setView("main")}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          返回
        </button>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 p-5">
        <h2 className="mb-3 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          模型连接（OpenAI 兼容接口）
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>接口地址</label>
            <input
              value={form.base_url}
              onChange={(e) => set("base_url", e.target.value)}
              className={inputCls}
              placeholder="https://api.openai.com/v1（本地 Ollama：http://localhost:11434/v1）"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>API Key（本地模型可留空）</label>
            <div className="flex gap-1.5">
              <input
                type={showKey ? "text" : "password"}
                value={form.api_key}
                onChange={(e) => set("api_key", e.target.value)}
                className={inputCls}
                placeholder="sk-…"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 rounded-md border border-neutral-300 px-2 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>模型</label>
            <input
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              className={inputCls}
              placeholder="deepseek-chat / qwen2.5:7b …"
            />
          </div>
          <div>
            <label className={labelCls}>温度（0–2）</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => set("temperature", parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>单次回复最大 token</label>
            <input
              type="number"
              min={1}
              value={form.max_tokens}
              onChange={(e) => set("max_tokens", parseInt(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>上下文窗口 token（超出裁剪旧消息）</label>
            <input
              type="number"
              min={1}
              value={form.max_context_tokens}
              onChange={(e) => set("max_context_tokens", parseInt(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
        </div>

        <h2 className="mb-3 mt-6 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          默认系统提示词（角色可单独覆盖）
        </h2>
        <textarea
          value={form.system_prompt}
          onChange={(e) => set("system_prompt", e.target.value)}
          rows={5}
          className={`${inputCls} resize-y`}
          placeholder="例如：你是一个乐于助人的助手，用简体中文回答。"
        />

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => save(form)}
            className="rounded-md bg-neutral-800 px-5 py-2 text-xs text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
