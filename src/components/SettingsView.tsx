import { useEffect, useState } from "react";
import type { Settings } from "../types";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import * as api from "../api/commands";

const inputCls =
  "w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800";
const labelCls = "mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400";
const tabCls = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-xs ${
    active
      ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
      : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
  }`;

type Tab = "model" | "generate" | "appearance";

// 设置整窗：模型连接 / 生成参数 / 界面显示 三个分类
export default function SettingsView() {
  const { settings, load, save } = useSettingsStore();
  const setView = useUiStore((s) => s.setView);
  const showToast = useUiStore((s) => s.showToast);
  const [form, setForm] = useState<Settings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [tab, setTab] = useState<Tab>("model");

  // 模型列表
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

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

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await api.listModels();
      setModels(list);
      showToast(`获取到 ${list.length} 个模型`);
    } catch (e) {
      setModels(null);
      showToast(`获取模型失败: ${e}`);
    } finally {
      setLoadingModels(false);
    }
  };

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

      <div className="flex gap-1.5 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
        <button className={tabCls(tab === "model")} onClick={() => setTab("model")}>
          模型连接
        </button>
        <button className={tabCls(tab === "generate")} onClick={() => setTab("generate")}>
          生成参数
        </button>
        <button className={tabCls(tab === "appearance")} onClick={() => setTab("appearance")}>
          界面显示
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 p-5">
        {tab === "model" && (
          <>
            <div className="col-span-2">
              <label className={labelCls}>接口地址（自动补全 /v1/chat/completions 后缀）</label>
              <input
                value={form.base_url}
                onChange={(e) => set("base_url", e.target.value)}
                className={inputCls}
                placeholder="https://api.deepseek.com（本地 Ollama：http://localhost:11434/v1）"
              />
            </div>
            <div className="mt-4">
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
            <div className="mt-4">
              <label className={labelCls}>模型</label>
              <div className="flex gap-1.5">
                <input
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  className={inputCls}
                  placeholder="deepseek-chat / qwen2.5:7b …"
                />
                <button
                  onClick={fetchModels}
                  disabled={loadingModels}
                  className="shrink-0 rounded-md border border-neutral-300 px-2 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                >
                  {loadingModels ? "获取中…" : "获取模型列表"}
                </button>
              </div>
              {models && models.length > 0 && (
                <div className="mt-2">
                  <select
                    value={form.model}
                    onChange={(e) => set("model", e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">从上游选择…</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-neutral-400">
                提示：输入接口地址后点「获取模型列表」，即可从上游选择模型
              </p>
            </div>
          </>
        )}

        {tab === "generate" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>温度（0–2，越高越自由）</label>
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
            <div className="col-span-2">
              <label className={labelCls}>上下文窗口 token（超出裁剪旧消息）</label>
              <input
                type="number"
                min={1}
                value={form.max_context_tokens}
                onChange={(e) => set("max_context_tokens", parseInt(e.target.value) || 1)}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>默认系统提示词（角色可单独覆盖）</label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => set("system_prompt", e.target.value)}
                rows={5}
                className={`${inputCls} resize-y`}
                placeholder="例如：你是一个乐于助人的助手，用简体中文回答。"
              />
            </div>
          </div>
        )}

        {tab === "appearance" && (
          <div className="flex flex-col gap-5">
            <div>
              <label className={labelCls}>主题</label>
              <div className="flex gap-2">
                {(
                  [
                    ["system", "跟随系统"],
                    ["light", "浅色"],
                    ["dark", "深色"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => set("ui_theme", v)}
                    className={`rounded-md px-4 py-2 text-xs ${
                      form.ui_theme === v
                        ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                        : "border border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>消息字号</label>
              <div className="flex gap-2">
                {[
                  [12, "小"],
                  [13, "中"],
                  [14, "大"],
                  [16, "特大"],
                ].map(([size, label]) => (
                  <button
                    key={size}
                    onClick={() => set("ui_font_size", size as number)}
                    className={`rounded-md px-4 py-2 text-xs ${
                      form.ui_font_size === size
                        ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                        : "border border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">保存后立即生效</p>
            </div>
          </div>
        )}

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
